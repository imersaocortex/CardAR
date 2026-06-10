import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureAsaasKey, createCustomer, updateCustomer, createCheckout, cancelSubscription, getNextDueDate, getPaymentsByCustomer } from "@/lib/asaas"

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

  const { data: payments } = await supabase
    .from("asaas_payments")
    .select("*")
    .eq("organization_id", orgId)
    .order("due_date", { ascending: false })

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

  return NextResponse.json({
    subscription,
    payments: payments || [],
    usage,
    checkout: asaasCheckouts?.[0] || null,
  })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await request.json()
  const { action, plan_id } = body
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

    // Try loading ASAAS key from DB settings if not in env
    await ensureAsaasKey(admin)

    const { data: plan } = await admin.from("plans").select("*").eq("id", plan_id).single()
    if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })

    // Get profile data for ASAAS
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    // Check if ASAAS is configured
    if (process.env.ASAAS_API_KEY) {
      try {
        // Get or create ASAAS customer with profile data
        let asaasCustomerId: string
        const { data: existingCustomer } = await admin
          .from("asaas_customers")
          .select("asaas_customer_id")
          .eq("organization_id", orgId)
          .single()

        if (existingCustomer) {
          asaasCustomerId = existingCustomer.asaas_customer_id
          // Update customer data if profile has changed
          if (profile?.cpf_cnpj || profile?.phone) {
            try {
              await updateCustomer(asaasCustomerId, {
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
            } catch {}
          }
        } else {
          asaasCustomerId = await createCustomer(
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

        // Cancel old subscription if exists
        const { data: currentSub } = await admin
          .from("subscriptions")
          .select("asaas_subscription_id")
          .eq("organization_id", orgId)
          .single()

        if (currentSub?.asaas_subscription_id) {
          try {
            await cancelSubscription(currentSub.asaas_subscription_id)
            console.log("[billing] Cancelled old ASAAS subscription:", currentSub.asaas_subscription_id)
          } catch (e) {
            console.warn("[billing] Failed to cancel old ASAAS subscription:", currentSub.asaas_subscription_id, e)
          }
        }

        // Determine cycle for ASAAS
        const asaasCycle = plan.billing_cycle === "yearly" ? "YEARLY" : "MONTHLY"
        // Checkout v3 only supports CREDIT_CARD for RECURRENT subscriptions
        const billingType = "CREDIT_CARD"

        // Create ASAAS checkout (subscription is created inline by ASAAS)
        const callbackUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || ""
        const checkout = await createCheckout(
          asaasCustomerId,
          billingType,
          plan.price / 100,
          getNextDueDate(),
          asaasCycle,
          `AR Business Studio - ${plan.name}`,
          callbackUrl,
        )

        // Update local subscription (asaas_subscription_id will be filled by webhook)
        await admin
          .from("subscriptions")
          .update({
            plan_id: plan.id,
            status: "active",
            trial_ends_at: null,
          })
          .eq("organization_id", orgId)

        // Save checkout info
        await admin.from("asaas_checkouts").insert({
          organization_id: orgId,
          plan_id: plan.id,
          asaas_checkout_id: checkout.id,
          checkout_url: checkout.url,
          status: "pending",
        })

        // Update usage limits
        await admin
          .from("usage_limits")
          .update({
            projects_limit: plan.projects_limit,
            assets_limit_bytes: plan.assets_limit_bytes,
          })
          .eq("organization_id", orgId)

        return NextResponse.json({ success: true, checkout_url: checkout.url })

      } catch (err: any) {
        console.error("[billing] ASAAS error:", err?.message || err)
        return NextResponse.json({ error: `Erro ao processar pagamento no ASAAS: ${err?.message || "Falha na comunicação"}` }, { status: 502 })
      }
    } else {
      // No ASAAS — just update locally (sandbox mode)
      await admin
        .from("subscriptions")
        .update({ plan_id: plan.id, status: "active", trial_ends_at: null })
        .eq("organization_id", orgId)

      await admin
        .from("usage_limits")
        .update({
          projects_limit: plan.projects_limit,
          assets_limit_bytes: plan.assets_limit_bytes,
        })
        .eq("organization_id", orgId)

      // Create fake checkout so billing page shows redirect link
      await admin.from("asaas_checkouts").insert({
        organization_id: orgId,
        plan_id: plan.id,
        asaas_checkout_id: "sandbox",
        checkout_url: "/billing?upgraded=true",
        status: "pending",
      })

      return NextResponse.json({ success: true, checkout_url: "/billing?upgraded=true" })
    }
  }

  if (action === "first_payment") {
    // Try loading ASAAS key from DB settings if not in env
    await ensureAsaasKey(admin)

    // First payment for a pending subscription (new user)
    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("organization_id", orgId)
      .single()

    if (!currentSub || currentSub.status !== "pending") {
      return NextResponse.json({ error: "Assinatura não está pendente" }, { status: 400 })
    }

    const plan = currentSub.plans

    // Check profile has CPF
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!profile?.cpf_cnpj) {
      return NextResponse.json({ error: "Complete seu CPF/CNPJ no perfil antes de pagar", redirect: "/profile" }, { status: 400 })
    }

    if (!process.env.ASAAS_API_KEY) {
      // No ASAAS — activate immediately (sandbox)
      await admin.from("subscriptions").update({ status: "active" }).eq("organization_id", orgId)
      await admin.from("usage_limits").update({
        projects_limit: plan.projects_limit,
        assets_limit_bytes: plan.assets_limit_bytes,
      }).eq("organization_id", orgId)
      // Create fake checkout so billing page shows redirect link
      await admin.from("asaas_checkouts").insert({
        organization_id: orgId,
        plan_id: plan.id,
        asaas_checkout_id: "sandbox",
        checkout_url: "/billing?upgraded=true",
        status: "pending",
      })
      return NextResponse.json({ success: true, checkout_url: "/billing?upgraded=true" })
    }

    try {
      // Get or create ASAAS customer
      let asaasCustomerId: string
      const { data: existingCustomer } = await admin
        .from("asaas_customers")
        .select("asaas_customer_id")
        .eq("organization_id", orgId)
        .single()

      if (existingCustomer) {
        asaasCustomerId = existingCustomer.asaas_customer_id
        if (profile?.cpf_cnpj || profile?.phone) {
          try {
            await updateCustomer(asaasCustomerId, {
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
          } catch {}
        }
      } else {
        asaasCustomerId = await createCustomer(
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

      // Create ASAAS checkout (subscription is created inline by ASAAS)
      const asaasCycle = plan.billing_cycle === "yearly" ? "YEARLY" : "MONTHLY"
      // Checkout v3 only supports CREDIT_CARD for RECURRENT subscriptions
      const billingType = "CREDIT_CARD"

      const callbackUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || ""
      const checkout = await createCheckout(
        asaasCustomerId,
        billingType,
        plan.price / 100,
        getNextDueDate(),
        asaasCycle,
        `AR Business Studio - ${plan.name}`,
        callbackUrl,
      )

      // Don't save ASAAS sub ID yet — webhook will fill it on first payment

      // Save checkout info
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
  }

  if (action === "cancel") {
    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id")
      .eq("organization_id", orgId)
      .single()

    if (currentSub?.asaas_subscription_id) {
      try { await cancelSubscription(currentSub.asaas_subscription_id) } catch {}
    }

    const { data: starterPlan } = await admin
      .from("plans")
      .select("id, projects_limit, assets_limit_bytes")
      .eq("slug", "starter")
      .single()

    if (starterPlan) {
      await admin
        .from("subscriptions")
        .update({
          plan_id: starterPlan.id,
          asaas_subscription_id: null,
          status: "canceled",
        })
        .eq("organization_id", orgId)

      await admin
        .from("usage_limits")
        .update({
          projects_limit: starterPlan.projects_limit,
          assets_limit_bytes: starterPlan.assets_limit_bytes,
        })
        .eq("organization_id", orgId)
    }

    return NextResponse.json({ success: true })
  }

  if (action === "checkout_success") {
    await ensureAsaasKey(admin)

    if (!process.env.ASAAS_API_KEY) {
      return NextResponse.json({ success: true })
    }

    // Find ASAAS customer for this org
    const { data: existingCustomer } = await admin
      .from("asaas_customers")
      .select("asaas_customer_id")
      .eq("organization_id", orgId)
      .single()

    if (!existingCustomer) {
      return NextResponse.json({ success: true })
    }

    try {
      const payments = await getPaymentsByCustomer(existingCustomer.asaas_customer_id)
      const paidPayment = payments.find(
        (p: any) => (p.status === "RECEIVED" || p.status === "CONFIRMED") && p.subscription
      )

      if (!paidPayment) {
        console.log("[billing] checkout_success - no paid payment with subscription found")
        return NextResponse.json({ success: true })
      }

      // Save ASAAS subscription ID
      if (paidPayment.subscription) {
        await admin
          .from("subscriptions")
          .update({ asaas_subscription_id: paidPayment.subscription })
          .eq("organization_id", orgId)
      }

      // Check if payment already saved
      const { data: existingPayment } = await admin
        .from("asaas_payments")
        .select("id")
        .eq("asaas_payment_id", paidPayment.id)
        .single()

      if (!existingPayment) {
        const { data: localSub } = await admin
          .from("subscriptions")
          .select("id")
          .eq("organization_id", orgId)
          .single()

        await admin.from("asaas_payments").insert({
          organization_id: orgId,
          subscription_id: localSub?.id || null,
          asaas_payment_id: paidPayment.id,
          status: paidPayment.status || "PENDING",
          value: paidPayment.value || 0,
          due_date: paidPayment.dueDate || new Date().toISOString().split("T")[0],
          paid_date: paidPayment.paidDate || null,
          invoice_url: paidPayment.invoiceUrl || null,
        })
        console.log("[billing] checkout_success - payment record created:", paidPayment.id)
      }

      // Extend subscription period
      const { data: currentSub } = await admin
        .from("subscriptions")
        .select("current_period_end, status, plan_id")
        .eq("organization_id", orgId)
        .single()

      if (currentSub) {
        const updates: Record<string, any> = { status: "active" }
        const newEnd = new Date(currentSub.current_period_end || Date.now())
        newEnd.setMonth(newEnd.getMonth() + 1)
        updates.current_period_end = newEnd.toISOString()

        await admin
          .from("subscriptions")
          .update(updates)
          .eq("organization_id", orgId)

        if (currentSub.status === "pending") {
          const { data: plan } = await admin
            .from("plans")
            .select("projects_limit, assets_limit_bytes")
            .eq("id", currentSub.plan_id)
            .single()

          if (plan) {
            await admin
              .from("usage_limits")
              .update({
                projects_limit: plan.projects_limit,
                assets_limit_bytes: plan.assets_limit_bytes,
              })
              .eq("organization_id", orgId)
          }

          await admin.rpc("unsuspend_org_projects", {
            p_organization_id: orgId,
          })
        }
      }

      return NextResponse.json({ success: true })
    } catch (err: any) {
      console.error("[billing] checkout_success error:", err?.message || err)
      return NextResponse.json({ success: true })
    }
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
