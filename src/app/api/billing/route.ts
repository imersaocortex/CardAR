import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureAsaasKey, createCustomer as asaasCreateCustomer, updateCustomer as asaasUpdateCustomer, getCustomer as asaasGetCustomer, createCheckout as asaasCreateCheckout, cancelSubscription as asaasCancelSubscription, getNextDueDate, getTodayDate, getPayments as asaasGetPayments, getPaymentsByCustomer as asaasGetPaymentsByCustomer, getSubscriptionsByCustomer as asaasGetSubscriptionsByCustomer } from "@/lib/asaas"
import { ensureStripeKey, createCustomer as stripeCreateCustomer, createCheckoutSession as stripeCreateCheckoutSession, cancelSubscription as stripeCancelSubscription, getCheckoutSession as stripeGetCheckoutSession } from "@/lib/stripe"
import { sendPlanChangeNotification, sendSubscriptionCanceledNotification } from "@/lib/evolution"

function localDateStr() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0]
}

function localMidnightISO() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!memberships) return NextResponse.json({ error: "Sem organização" }, { status: 404 })

  const orgId = memberships.organization_id

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("organization_id", orgId)
    .single()

  const [asaasResult, stripeResult] = await Promise.all([
    supabase.from("asaas_payments").select("*").eq("organization_id", orgId).order("due_date", { ascending: false }),
    supabase.from("stripe_payments").select("*").eq("organization_id", orgId).order("due_date", { ascending: false }),
  ])

  const { data: usage } = await supabase
    .from("usage_limits")
    .select("*")
    .eq("organization_id", orgId)
    .single()

  const { data: asaasCheckouts } = await supabase
    .from("asaas_checkouts")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)

  const { data: stripeCheckouts } = await supabase
    .from("stripe_checkouts")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)

  const allPayments = [
    ...((asaasResult.data || []) as any[]).map((p: any) => ({ ...p, _gateway: "asaas" })),
    ...((stripeResult.data || []) as any[]).map((p: any) => ({ ...p, _gateway: "stripe" })),
  ].sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

  const provider = subscription?.payment_provider || "asaas"
  const checkout = provider === "stripe"
    ? stripeCheckouts?.[0] || null
    : asaasCheckouts?.[0] || null

  return NextResponse.json({
    subscription,
    payments: allPayments,
    usage,
    checkout,
  })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await request.json()
  const { action, plan_id, payment_provider = "asaas" } = body
  const admin = createAdminClient()

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!memberships) return NextResponse.json({ error: "Sem organização" }, { status: 404 })

  const orgId = memberships.organization_id

  if (action === "upgrade") {
    if (!plan_id) return NextResponse.json({ error: "plan_id é obrigatório" }, { status: 400 })

    await ensureAsaasKey(admin)
    await ensureStripeKey(admin)

    const { data: plan } = await admin.from("plans").select("*").eq("id", plan_id).single()
    if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (payment_provider === "stripe") {
      return handleStripeUpgrade(admin, request, orgId, user, profile, plan)
    }

    // ----- ASAAS UPGRADE -----
    if (!profile?.cpf_cnpj) {
      return NextResponse.json({ error: "Complete seu CPF/CNPJ no perfil antes de assinar", redirect: "/profile" }, { status: 400 })
    }

    if (process.env.ASAAS_API_KEY) {
      try {
        let asaasCustomerId: string
        const { data: existingCustomer } = await admin
          .from("asaas_customers")
          .select("asaas_customer_id")
          .eq("organization_id", orgId)
          .single()

        if (existingCustomer) {
          // Verify the customer still exists in ASAAS (sandbox resets/expunges data periodically)
          try {
            await asaasGetCustomer(existingCustomer.asaas_customer_id)
            asaasCustomerId = existingCustomer.asaas_customer_id
          } catch {
            // Customer no longer exists in ASAAS — create a new one
            console.log("[billing] ASAAS customer", existingCustomer.asaas_customer_id, "not found, creating new")
            await admin.from("asaas_customers").delete().eq("organization_id", orgId)
            asaasCustomerId = await asaasCreateCustomer(
              orgId,
              profile?.name || user.email || orgId,
              user.email!,
              profile?.cpf_cnpj || undefined,
              profile?.phone || undefined,
              profile?.address || undefined,
              profile?.address_number || undefined,
              profile?.address_complement || undefined,
              profile?.address_neighborhood || undefined,
              profile?.address_city || undefined,
              profile?.address_state || undefined,
              profile?.address_zipcode || undefined,
            )
            await admin.from("asaas_customers").insert({
              organization_id: orgId,
              asaas_customer_id: asaasCustomerId,
            })
          }
          // Always sync latest profile data to ASAAS
          try {
            await asaasUpdateCustomer(asaasCustomerId, {
              name: profile?.name || user.email || orgId,
              email: user.email!,
              cpfCnpj: profile?.cpf_cnpj || undefined,
              phone: profile?.phone || undefined,
              address: profile?.address || undefined,
              addressNumber: profile?.address_number || undefined,
              complement: profile?.address_complement || undefined,
              province: profile?.address_neighborhood || undefined,
              city: profile?.address_city || undefined,
              state: profile?.address_state || undefined,
              postalCode: profile?.address_zipcode || undefined,
            })
          } catch (e) {
            console.warn("[billing] Failed to update ASAAS customer:", e)
          }
        } else {
          asaasCustomerId = await asaasCreateCustomer(
            orgId,
            profile?.name || user.email || orgId,
            user.email!,
            profile?.cpf_cnpj || undefined,
            profile?.phone || undefined,
            profile?.address || undefined,
            profile?.address_number || undefined,
            profile?.address_complement || undefined,
            profile?.address_neighborhood || undefined,
            profile?.address_city || undefined,
            profile?.address_state || undefined,
            profile?.address_zipcode || undefined,
          )
          await admin.from("asaas_customers").insert({
            organization_id: orgId,
            asaas_customer_id: asaasCustomerId,
          })
        }

        const { data: currentSub } = await admin
          .from("subscriptions")
          .select("asaas_subscription_id")
          .eq("organization_id", orgId)
          .single()

        const cancelledIds = new Set<string>()

        if (currentSub?.asaas_subscription_id) {
          cancelledIds.add(currentSub.asaas_subscription_id)
          try {
            await asaasCancelSubscription(currentSub.asaas_subscription_id)
          } catch (e) {
            console.warn("[billing] Failed to cancel old ASAAS subscription:", currentSub.asaas_subscription_id, e)
          }

          try {
            const oldPayments = await asaasGetPayments(currentSub.asaas_subscription_id)
            const oldPaymentIds = oldPayments.map((p: any) => p.id)
            if (oldPaymentIds.length > 0) {
              await admin.from("asaas_payments").update({ status: "CANCELLED" }).in("asaas_payment_id", oldPaymentIds)
            }
          } catch (e) {
            console.warn("[billing] Failed to fetch old payments for cancellation:", e)
          }
        }

        try {
          const asaasSubs = await asaasGetSubscriptionsByCustomer(asaasCustomerId)
          for (const asaasSub of asaasSubs) {
            if (asaasSub.status !== "CANCELED" && asaasSub.status !== "EXPIRED" && !cancelledIds.has(asaasSub.id)) {
              try {
                await asaasCancelSubscription(asaasSub.id)
              } catch (e) {
                console.warn("[billing] Failed to cancel extra ASAAS subscription:", asaasSub.id, e)
              }
            }
          }
        } catch (e) {
          console.warn("[billing] Failed to list ASAAS subscriptions for customer:", e)
        }

        const hasTrial = plan.trial_days > 0
        const asaasCycle = plan.billing_cycle === "yearly" ? "YEARLY" : "MONTHLY"
        const billingType = "CREDIT_CARD"

        const callbackUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || ""
        const checkout = await asaasCreateCheckout(
          asaasCustomerId,
          billingType,
          plan.price,
          getTodayDate(),
          asaasCycle,
          `AR Business Studio - ${plan.name}`,
          callbackUrl,
          hasTrial ? plan.trial_days : undefined,
        )

        // Only update subscription status AFTER checkout is created successfully
        if (hasTrial) {
          const trialEnd = new Date()
          trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
          await admin.from("subscriptions").update({
            status: "trialing",
            trial_ends_at: trialEnd.toISOString(),
            payment_provider: "asaas",
            plan_id: plan.id,
          }).eq("organization_id", orgId)
          await admin.from("usage_limits").update({
            projects_limit: plan.projects_limit,
            assets_limit_bytes: plan.assets_limit_bytes,
          }).eq("organization_id", orgId)
        } else {
          await admin.from("subscriptions").update({
            payment_provider: "asaas",
            plan_id: plan.id,
          }).eq("organization_id", orgId)
        }

        const asaasSubId = checkout.subscription || null
        if (asaasSubId) {
          await admin.from("subscriptions").update({ asaas_subscription_id: asaasSubId }).eq("organization_id", orgId)
        }

        await admin.from("asaas_checkouts").insert({
          organization_id: orgId,
          plan_id: plan.id,
          asaas_checkout_id: checkout.id,
          checkout_url: checkout.url,
          status: "pending",
        })

        return NextResponse.json({ success: true, checkout_url: checkout.url })
      } catch (err: any) {
        console.error("[billing] ASAAS error:", err?.message || err)
        return NextResponse.json({ error: `Erro ao processar pagamento no ASAAS: ${err?.message || "Falha na comunicação"}` }, { status: 502 })
      }
    } else {
      // No ASAAS — sandbox mode
      const hasTrial = plan.trial_days > 0
      const subUpdates: Record<string, any> = { plan_id: plan.id, payment_provider: "asaas" }
      if (hasTrial) {
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
        subUpdates.status = "trialing"
        subUpdates.trial_ends_at = trialEnd.toISOString()
      } else {
        subUpdates.status = "active"
        subUpdates.trial_ends_at = null
      }
      await admin.from("subscriptions").update(subUpdates).eq("organization_id", orgId)
      await admin.from("usage_limits").update({ projects_limit: plan.projects_limit, assets_limit_bytes: plan.assets_limit_bytes }).eq("organization_id", orgId)
      await admin.from("asaas_checkouts").insert({
        organization_id: orgId, plan_id: plan.id, asaas_checkout_id: "sandbox", checkout_url: "/billing?upgraded=true", status: "pending",
      })
      return NextResponse.json({ success: true, checkout_url: "/billing?upgraded=true" })
    }
  }

  if (action === "first_payment") {
    await ensureAsaasKey(admin)
    await ensureStripeKey(admin)

    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("organization_id", orgId)
      .single()

    if (!currentSub || currentSub.status !== "pending") {
      return NextResponse.json({ error: "Assinatura não está pendente" }, { status: 400 })
    }

    const plan = currentSub.plans

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (payment_provider === "stripe") {
      if (!process.env.STRIPE_SECRET_KEY) {
        // No Stripe — sandbox
        const hasTrial = plan.trial_days > 0
        const subUpdates: Record<string, any> = { payment_provider: "stripe" }
        if (hasTrial) {
          const trialEnd = new Date()
          trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
          subUpdates.status = "trialing"
          subUpdates.trial_ends_at = trialEnd.toISOString()
        } else {
          subUpdates.status = "active"
        }
        await admin.from("subscriptions").update(subUpdates).eq("organization_id", orgId)
        await admin.from("usage_limits").update({ projects_limit: plan.projects_limit, assets_limit_bytes: plan.assets_limit_bytes }).eq("organization_id", orgId)
        await admin.from("stripe_checkouts").insert({
          organization_id: orgId, plan_id: plan.id, stripe_session_id: "sandbox", checkout_url: "/billing?upgraded=true", status: "pending",
        })
        return NextResponse.json({ success: true, checkout_url: "/billing?upgraded=true" })
      }

      return handleStripeFirstPayment(admin, request, orgId, user, profile, plan)
    }

    // ----- ASAAS FIRST PAYMENT (existing flow) -----
    if (!profile?.cpf_cnpj) {
      return NextResponse.json({ error: "Complete seu CPF/CNPJ no perfil antes de pagar", redirect: "/profile" }, { status: 400 })
    }

    if (!process.env.ASAAS_API_KEY) {
      const hasTrial = plan.trial_days > 0
      const subUpdates: Record<string, any> = { payment_provider: "asaas" }
      if (hasTrial) {
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
        subUpdates.status = "trialing"
        subUpdates.trial_ends_at = trialEnd.toISOString()
      } else {
        subUpdates.status = "active"
      }
      await admin.from("subscriptions").update(subUpdates).eq("organization_id", orgId)
      await admin.from("usage_limits").update({ projects_limit: plan.projects_limit, assets_limit_bytes: plan.assets_limit_bytes }).eq("organization_id", orgId)
      await admin.from("asaas_checkouts").insert({
        organization_id: orgId, plan_id: plan.id, asaas_checkout_id: "sandbox", checkout_url: "/billing?upgraded=true", status: "pending",
      })
      return NextResponse.json({ success: true, checkout_url: "/billing?upgraded=true" })
    }

    try {
      let asaasCustomerId: string
      const { data: existingCustomer } = await admin
        .from("asaas_customers")
        .select("asaas_customer_id")
        .eq("organization_id", orgId)
        .single()

      if (existingCustomer) {
        // Verify the customer still exists in ASAAS (sandbox resets/expunges data periodically)
        try {
          await asaasGetCustomer(existingCustomer.asaas_customer_id)
          asaasCustomerId = existingCustomer.asaas_customer_id
        } catch {
          console.log("[billing] ASAAS customer", existingCustomer.asaas_customer_id, "not found, creating new")
          await admin.from("asaas_customers").delete().eq("organization_id", orgId)
          asaasCustomerId = await asaasCreateCustomer(
            orgId, profile?.name || user.email || orgId, user.email!,
            profile?.cpf_cnpj || undefined, profile?.phone || undefined,
            profile?.address || undefined, profile?.address_number || undefined,
            profile?.address_complement || undefined, profile?.address_neighborhood || undefined,
            profile?.address_city || undefined, profile?.address_state || undefined,
            profile?.address_zipcode || undefined,
          )
          await admin.from("asaas_customers").insert({ organization_id: orgId, asaas_customer_id: asaasCustomerId })
        }
        // Always sync latest profile data to ASAAS
        try {
          await asaasUpdateCustomer(asaasCustomerId, {
            name: profile?.name || user.email || orgId, email: user.email!,
            cpfCnpj: profile?.cpf_cnpj || undefined, phone: profile?.phone || undefined,
            address: profile?.address || undefined, addressNumber: profile?.address_number || undefined,
            complement: profile?.address_complement || undefined, province: profile?.address_neighborhood || undefined,
            city: profile?.address_city || undefined, state: profile?.address_state || undefined,
            postalCode: profile?.address_zipcode || undefined,
          })
        } catch (e) {
          console.warn("[billing] Failed to update ASAAS customer:", e)
        }
      } else {
        asaasCustomerId = await asaasCreateCustomer(
          orgId, profile?.name || user.email || orgId, user.email!,
          profile?.cpf_cnpj || undefined, profile?.phone || undefined,
          profile?.address || undefined, profile?.address_number || undefined,
          profile?.address_complement || undefined, profile?.address_neighborhood || undefined,
          profile?.address_city || undefined, profile?.address_state || undefined,
          profile?.address_zipcode || undefined,
        )
        await admin.from("asaas_customers").insert({ organization_id: orgId, asaas_customer_id: asaasCustomerId })
      }

      const hasTrial = plan.trial_days > 0
      const asaasCycle = plan.billing_cycle === "yearly" ? "YEARLY" : "MONTHLY"
      const billingType = "CREDIT_CARD"

      const callbackUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || ""
      const checkout = await asaasCreateCheckout(asaasCustomerId, billingType, plan.price, getTodayDate(), asaasCycle, `AR Business Studio - ${plan.name}`, callbackUrl, hasTrial ? plan.trial_days : undefined)

      // Only update subscription status AFTER checkout is created successfully
      if (hasTrial) {
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
        await admin.from("subscriptions").update({
          status: "trialing",
          trial_ends_at: trialEnd.toISOString(),
          payment_provider: "asaas",
        }).eq("organization_id", orgId)
        await admin.from("usage_limits").update({
          projects_limit: plan.projects_limit,
          assets_limit_bytes: plan.assets_limit_bytes,
        }).eq("organization_id", orgId)
      } else {
        await admin.from("subscriptions").update({
          payment_provider: "asaas",
        }).eq("organization_id", orgId)
      }

      if (checkout.subscription) {
        await admin.from("subscriptions").update({ asaas_subscription_id: checkout.subscription }).eq("organization_id", orgId)
      }

      await admin.from("asaas_checkouts").insert({
        organization_id: orgId, plan_id: plan.id, asaas_checkout_id: checkout.id, checkout_url: checkout.url, status: "pending",
      })

      return NextResponse.json({ success: true, checkout_url: checkout.url })
    } catch (err: any) {
      console.error("[billing] ASAAS error:", err?.message || err)
      return NextResponse.json({ error: `Erro ao processar pagamento no ASAAS: ${err?.message || "Falha na comunicação"}` }, { status: 502 })
    }
  }

  if (action === "cancel") {
    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id, stripe_subscription_id, plan_id, payment_provider")
      .eq("organization_id", orgId)
      .single()

    let canceledPlanName = ""
    if (currentSub?.plan_id) {
      const { data: p } = await admin.from("plans").select("name").eq("id", currentSub.plan_id).single()
      if (p) canceledPlanName = p.name
    }

    if (currentSub?.payment_provider === "stripe") {
      if (currentSub.stripe_subscription_id) {
        await ensureStripeKey(admin)
        try { await stripeCancelSubscription(currentSub.stripe_subscription_id) } catch {
          console.warn("[billing] Failed to cancel Stripe subscription:", currentSub.stripe_subscription_id)
        }
      }
    } else {
      if (currentSub?.asaas_subscription_id) {
        try { await asaasCancelSubscription(currentSub.asaas_subscription_id) } catch {}
      }
    }

    const { data: starterPlan } = await admin
      .from("plans")
      .select("id, projects_limit, assets_limit_bytes")
      .eq("slug", "starter")
      .single()

    if (starterPlan) {
      await admin.from("subscriptions").update({
        plan_id: starterPlan.id, asaas_subscription_id: null, stripe_subscription_id: null, status: "canceled",
      }).eq("organization_id", orgId)
      await admin.from("usage_limits").update({
        projects_limit: starterPlan.projects_limit, assets_limit_bytes: starterPlan.assets_limit_bytes,
      }).eq("organization_id", orgId)
    }

    if (canceledPlanName) {
      sendSubscriptionCanceledNotification(orgId, canceledPlanName).catch((e: any) =>
        console.warn("[billing] Failed to send cancel notification:", e)
      )
    }

    return NextResponse.json({ success: true })
  }

  if (action === "checkout_success") {
    await ensureAsaasKey(admin)
    await ensureStripeKey(admin)

    const { data: sub } = await admin
      .from("subscriptions")
      .select("payment_provider")
      .eq("organization_id", orgId)
      .single()

    if (sub?.payment_provider === "stripe") {
      try {
        const { data: pendingCheckout } = await admin
          .from("stripe_checkouts")
          .select("*")
          .eq("organization_id", orgId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pendingCheckout?.stripe_session_id) {
          const session = await stripeGetCheckoutSession(pendingCheckout.stripe_session_id)
          const isPaid = session.payment_status === "paid"

          const targetPlanId = pendingCheckout.plan_id

          if (isPaid) {
            const { data: currentSub } = await admin
              .from("subscriptions")
              .select("current_period_end, status, plan_id")
              .eq("organization_id", orgId)
              .single()

            if (targetPlanId) {
              const { data: plan } = await admin
                .from("plans")
                .select("name, projects_limit, assets_limit_bytes")
                .eq("id", targetPlanId)
                .single()

              if (plan) {
                await admin
                  .from("subscriptions")
                  .update({ plan_id: targetPlanId, status: "active" })
                  .eq("organization_id", orgId)

                await admin
                  .from("usage_limits")
                  .update({ projects_limit: plan.projects_limit, assets_limit_bytes: plan.assets_limit_bytes })
                  .eq("organization_id", orgId)

                if (session.subscription) {
                  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id
                  await admin
                    .from("subscriptions")
                    .update({ stripe_subscription_id: subId })
                    .eq("organization_id", orgId)
                }

                const newEnd = new Date()
                newEnd.setMonth(newEnd.getMonth() + 1)
                await admin
                  .from("subscriptions")
                  .update({ current_period_end: newEnd.toISOString() })
                  .eq("organization_id", orgId)

                await admin.rpc("unsuspend_org_projects", { p_organization_id: orgId })
              }
            }

            const paymentIntentId = (session.invoice as any)?.payment_intent || (session.invoice as any)?.id || session.payment_intent || session.id
            const { data: existingPayment } = await admin
              .from("stripe_payments")
              .select("id")
              .eq("stripe_payment_intent_id", paymentIntentId)
              .maybeSingle()

            if (!existingPayment) {
              const { data: localSub } = await admin
                .from("subscriptions")
                .select("id")
                .eq("organization_id", orgId)
                .single()

              await admin.from("stripe_payments").insert({
                organization_id: orgId,
                subscription_id: localSub?.id || null,
                stripe_payment_intent_id: paymentIntentId,
                status: "paid",
                value: (session.amount_total || 0) / 100,
                due_date: localDateStr(),
                paid_date: localMidnightISO(),
                invoice_url: null,
              })
            }

            await admin
              .from("stripe_checkouts")
              .update({ status: "completed" })
              .eq("id", pendingCheckout.id)
          }
        }

        return NextResponse.json({ success: true })
      } catch (err: any) {
        console.error("[billing] stripe checkout_success error:", err?.message || err)
        return NextResponse.json({ success: true })
      }
    }

    // ----- ASAAS checkout_success (existing flow) -----
    if (!process.env.ASAAS_API_KEY) {
      return NextResponse.json({ success: true })
    }

    const { data: existingCustomer } = await admin
      .from("asaas_customers")
      .select("asaas_customer_id")
      .eq("organization_id", orgId)
      .single()

    if (!existingCustomer) {
      return NextResponse.json({ success: true })
    }

    try {
      const payments = await asaasGetPaymentsByCustomer(existingCustomer.asaas_customer_id)

      let foundPayment = payments.find(
        (p: any) => (p.status === "RECEIVED" || p.status === "CONFIRMED") && p.subscription
      )
      if (!foundPayment) {
        foundPayment = payments.find((p: any) => p.subscription)
      }

      if (!foundPayment) {
        console.log("[billing] checkout_success - no payment with subscription found")
        return NextResponse.json({ success: true })
      }

      const isPaid = foundPayment.status === "RECEIVED" || foundPayment.status === "CONFIRMED"

      if (foundPayment.subscription) {
        await admin.from("subscriptions").update({ asaas_subscription_id: foundPayment.subscription }).eq("organization_id", orgId)
      }

      const { data: existingPayment } = await admin
        .from("asaas_payments")
        .select("id")
        .eq("asaas_payment_id", foundPayment.id)
        .single()

      if (!existingPayment) {
        const { data: localSub } = await admin.from("subscriptions").select("id").eq("organization_id", orgId).single()
        await admin.from("asaas_payments").insert({
          organization_id: orgId, subscription_id: localSub?.id || null, asaas_payment_id: foundPayment.id,
          status: foundPayment.status || "PENDING", value: foundPayment.value || 0,
          due_date: foundPayment.dueDate || localDateStr(),
          paid_date: foundPayment.paidDate || null, invoice_url: foundPayment.invoiceUrl || null,
        })
      } else if (isPaid) {
        await admin.from("asaas_payments").update({ status: foundPayment.status, paid_date: foundPayment.paidDate || null }).eq("asaas_payment_id", foundPayment.id)
      }

      let targetPlanId: string | null = null
      let targetPlanName = ""
      let oldPlanName = ""

      const { data: pendingCheckout } = await admin
        .from("asaas_checkouts")
        .select("plan_id")
        .eq("organization_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pendingCheckout?.plan_id) {
        targetPlanId = pendingCheckout.plan_id
        const { data: currentSubPlan } = await admin.from("subscriptions").select("plan_id").eq("organization_id", orgId).single()
        if (currentSubPlan?.plan_id && currentSubPlan.plan_id !== targetPlanId) {
          const { data: oldPlan } = await admin.from("plans").select("name").eq("id", currentSubPlan.plan_id).single()
          if (oldPlan) oldPlanName = oldPlan.name
        }

        const { data: plan } = await admin.from("plans").select("name, projects_limit, assets_limit_bytes").eq("id", targetPlanId).single()
        if (plan) {
          targetPlanName = plan.name
          await admin.from("subscriptions").update({ plan_id: targetPlanId }).eq("organization_id", orgId)
          await admin.from("usage_limits").update({ projects_limit: plan.projects_limit, assets_limit_bytes: plan.assets_limit_bytes }).eq("organization_id", orgId)
        }
        await admin.from("asaas_checkouts").update({ status: "completed" }).eq("organization_id", orgId).eq("status", "pending")
      }

      const { data: currentSub } = await admin.from("subscriptions").select("current_period_end, status").eq("organization_id", orgId).single()
      if (currentSub) {
        const updates: Record<string, any> = { status: "active" }
        const newEnd = new Date(currentSub.current_period_end || Date.now())
        newEnd.setMonth(newEnd.getMonth() + 1)
        updates.current_period_end = newEnd.toISOString()
        await admin.from("subscriptions").update(updates).eq("organization_id", orgId)
        if (currentSub.status === "pending") {
          await admin.rpc("unsuspend_org_projects", { p_organization_id: orgId })
        }
      }

      if (oldPlanName && targetPlanName && oldPlanName !== targetPlanName) {
        sendPlanChangeNotification(orgId, oldPlanName, targetPlanName).catch((e: any) =>
          console.warn("[billing] Failed to send plan change notification:", e)
        )
      }

      return NextResponse.json({ success: true })
    } catch (err: any) {
      console.error("[billing] checkout_success error:", err?.message || err)
      return NextResponse.json({ success: true })
    }
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

// ----- STRIPE HELPERS -----

async function handleStripeUpgrade(
  admin: ReturnType<typeof createAdminClient>,
  request: Request,
  orgId: string,
  user: any,
  profile: any,
  plan: any,
) {
  if (!process.env.STRIPE_SECRET_KEY) {
    const hasTrial = plan.trial_days > 0
    const subUpdates: Record<string, any> = { plan_id: plan.id, payment_provider: "stripe" }
    if (hasTrial) {
      const trialEnd = new Date()
      trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
      subUpdates.status = "trialing"
      subUpdates.trial_ends_at = trialEnd.toISOString()
    } else {
      subUpdates.status = "active"
      subUpdates.trial_ends_at = null
    }
    await admin.from("subscriptions").update(subUpdates).eq("organization_id", orgId)
    await admin.from("usage_limits").update({ projects_limit: plan.projects_limit, assets_limit_bytes: plan.assets_limit_bytes }).eq("organization_id", orgId)
    await admin.from("stripe_checkouts").insert({
      organization_id: orgId, plan_id: plan.id, stripe_session_id: "sandbox", checkout_url: "/billing?upgraded=true", status: "pending",
    })
    return NextResponse.json({ success: true, checkout_url: "/billing?upgraded=true" })
  }

  try {
    let stripeCustomerId: string
    const { data: existingCustomer } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("organization_id", orgId)
      .single()

    if (existingCustomer) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      const customer = await stripeCreateCustomer(user.email!, profile?.name || user.email || orgId)
      stripeCustomerId = customer.id
      await admin.from("stripe_customers").insert({
        organization_id: orgId, stripe_customer_id: stripeCustomerId,
      })
    }

    const { data: sub } = await admin.from("subscriptions").select("stripe_subscription_id").eq("organization_id", orgId).single()
    if (sub?.stripe_subscription_id) {
      try { await stripeCancelSubscription(sub.stripe_subscription_id) } catch {}
    }

    const baseUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || ""
    const callbackUrl = `${baseUrl}/billing`

    const priceId = plan.stripe_price_id || null

    if (!priceId) {
      return NextResponse.json({
        error: "Stripe não configurado para este plano. Configure o Stripe Price ID no admin de planos.",
        redirect: "/admin?tab=plans",
      }, { status: 400 })
    }

    const hasTrial = plan.trial_days > 0

    const session = await stripeCreateCheckoutSession(stripeCustomerId, priceId, callbackUrl, callbackUrl, hasTrial ? plan.trial_days : undefined)

    const subUpdates: Record<string, any> = {
      payment_provider: "stripe",
      plan_id: plan.id,
    }

    if (hasTrial) {
      const trialEnd = new Date()
      trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
      subUpdates.status = "trialing"
      subUpdates.trial_ends_at = trialEnd.toISOString()
      await admin.from("usage_limits").update({
        projects_limit: plan.projects_limit,
        assets_limit_bytes: plan.assets_limit_bytes,
      }).eq("organization_id", orgId)
    }

    await admin.from("subscriptions").update(subUpdates).eq("organization_id", orgId)

    if (session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id
      await admin.from("subscriptions").update({ stripe_subscription_id: subId }).eq("organization_id", orgId)
    }

    await admin.from("stripe_checkouts").insert({
      organization_id: orgId, plan_id: plan.id,
      stripe_session_id: session.id, checkout_url: session.url || null, status: "pending",
    })

    return NextResponse.json({ success: true, checkout_url: session.url })
  } catch (err: any) {
    console.error("[billing] Stripe error:", err?.message || err)
    return NextResponse.json({ error: `Erro ao processar pagamento no Stripe: ${err?.message || "Falha na comunicação"}` }, { status: 502 })
  }
}

async function handleStripeFirstPayment(
  admin: ReturnType<typeof createAdminClient>,
  request: Request,
  orgId: string,
  user: any,
  profile: any,
  plan: any,
) {
  try {
    let stripeCustomerId: string
    const { data: existingCustomer } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("organization_id", orgId)
      .single()

    if (existingCustomer) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      const customer = await stripeCreateCustomer(user.email!, profile?.name || user.email || orgId)
      stripeCustomerId = customer.id
      await admin.from("stripe_customers").insert({
        organization_id: orgId, stripe_customer_id: stripeCustomerId,
      })
    }

    const baseUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || ""
    const callbackUrl = `${baseUrl}/billing`

    const priceId = plan.stripe_price_id || null

    if (!priceId) {
      return NextResponse.json({
        error: "Stripe não configurado para este plano. Configure o Stripe Price ID no admin de planos.",
        redirect: "/admin?tab=plans",
      }, { status: 400 })
    }

    const hasTrial = plan.trial_days > 0

    const session = await stripeCreateCheckoutSession(stripeCustomerId, priceId, callbackUrl, callbackUrl, hasTrial ? plan.trial_days : undefined)

    const subUpdates: Record<string, any> = {
      payment_provider: "stripe",
      plan_id: plan.id,
    }

    if (hasTrial) {
      const trialEnd = new Date()
      trialEnd.setDate(trialEnd.getDate() + plan.trial_days)
      subUpdates.status = "trialing"
      subUpdates.trial_ends_at = trialEnd.toISOString()
      await admin.from("usage_limits").update({
        projects_limit: plan.projects_limit,
        assets_limit_bytes: plan.assets_limit_bytes,
      }).eq("organization_id", orgId)
    }

    await admin.from("subscriptions").update(subUpdates).eq("organization_id", orgId)

    if (session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id
      await admin.from("subscriptions").update({ stripe_subscription_id: subId }).eq("organization_id", orgId)
    }

    await admin.from("stripe_checkouts").insert({
      organization_id: orgId, plan_id: plan.id,
      stripe_session_id: session.id, checkout_url: session.url || null, status: "pending",
    })

    return NextResponse.json({ success: true, checkout_url: session.url })
  } catch (err: any) {
    console.error("[billing] Stripe error:", err?.message || err)
    return NextResponse.json({ error: `Erro ao processar pagamento no Stripe: ${err?.message || "Falha na comunicação"}` }, { status: 502 })
  }
}
