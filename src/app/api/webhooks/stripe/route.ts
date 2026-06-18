import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  ensureStripeKey,
  loadWebhookSecret,
  constructWebhookEvent,
} from "@/lib/stripe"
import {
  sendPaymentSuccessNotification,
  sendOverdueNotification,
  sendPlanChangeNotification,
  sendSubscriptionCanceledNotification,
} from "@/lib/evolution"

function localDateStr() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0]
}

function localMidnightISO() {
  return new Date().toISOString()
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature") || ""
  const admin = createAdminClient()

  await ensureStripeKey(admin)
  await loadWebhookSecret(admin)

  let event: ReturnType<typeof constructWebhookEvent>
  try {
    event = constructWebhookEvent(body, signature)
  } catch (err: any) {
    console.error("[stripe-webhook] Invalid signature:", err?.message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const eventId = event.id

  const { data: existing } = await admin
    .from("webhook_events")
    .select("id")
    .eq("source", "stripe")
    .eq("event_id", eventId)
    .single()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  await admin.from("webhook_events").insert({
    source: "stripe",
    event_id: eventId,
    event_type: event.type,
    raw_body: event.data.object,
  })

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any
        if (session.mode === "subscription") {
          await handleCheckoutCompleted(admin, session)
        }
        break
      }
      case "invoice.paid": {
        await handleInvoicePaid(admin, event.data.object as any)
        break
      }
      case "invoice.payment_failed": {
        await handleInvoicePaymentFailed(admin, event.data.object as any)
        break
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(admin, event.data.object as any)
        break
      }
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(admin, event.data.object as any)
        break
      }
    }

    await admin
      .from("webhook_events")
      .update({ processed: true })
      .eq("source", "stripe")
      .eq("event_id", eventId)
  } catch (err: any) {
    console.error("[stripe-webhook] Processing error:", err)
    await admin
      .from("webhook_events")
      .update({
        processed: false,
        processing_error: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("source", "stripe")
      .eq("event_id", eventId)
  }

  return NextResponse.json({ received: true })
}

async function resolveOrgByCustomer(
  admin: ReturnType<typeof createAdminClient>,
  stripeCustomerId: string,
): Promise<string | null> {
  const { data: customer } = await admin
    .from("stripe_customers")
    .select("organization_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single()

  return customer?.organization_id || null
}

async function handleCheckoutCompleted(
  admin: ReturnType<typeof createAdminClient>,
  session: any,
) {
  const customerId = session.customer
  const subscriptionId = session.subscription
  if (!customerId || !subscriptionId) return

  const orgId = await resolveOrgByCustomer(admin, customerId)
  if (!orgId) {
    console.error("[stripe-webhook] Unknown customer:", customerId)
    return
  }

  const { data: localSub } = await admin
    .from("subscriptions")
    .select("id, plan_id")
    .eq("organization_id", orgId)
    .single()

  const targetPlanId = localSub?.plan_id || null

  const isPaid = session.payment_status === "paid"
  // If payment_status is "unpaid" with mode "subscription", Stripe is in trial
  const isTrialing = !isPaid && session.mode === "subscription"
  const status = isPaid ? "active" : isTrialing ? "trialing" : "pending"

  await admin
    .from("subscriptions")
    .update({
      status,
      stripe_subscription_id: subscriptionId,
      payment_provider: "stripe",
    })
    .eq("organization_id", orgId)

  if (isPaid) {
    const newEnd = new Date()
    newEnd.setMonth(newEnd.getMonth() + 1)
    await admin
      .from("subscriptions")
      .update({ current_period_end: newEnd.toISOString() })
      .eq("organization_id", orgId)
  }

  // Activate limits for trial users too (limits were already set during upgrade,
  // but on first payment flow they may not have been)
  if (targetPlanId) {
    const { data: plan } = await admin
      .from("plans")
      .select("projects_limit, assets_limit_bytes")
      .eq("id", targetPlanId)
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
  }

  await admin.from("stripe_checkouts").insert({
    organization_id: orgId,
    subscription_id: localSub?.id || null,
    plan_id: targetPlanId,
    stripe_session_id: session.id,
    checkout_url: session.url || null,
    status: "completed",
  })

  if (isPaid || isTrialing) {
    await admin.rpc("unsuspend_org_projects", {
      p_organization_id: orgId,
    })

    if (targetPlanId) {
      const { data: plan } = await admin
        .from("plans")
        .select("name")
        .eq("id", targetPlanId)
        .single()

      if (plan) {
        sendPaymentSuccessNotification(orgId, plan.name, (session.amount_total || 0) / 100)
          .catch((e: any) => console.warn("[stripe-webhook] Failed to send payment notification:", e))
      }
    }
  }
}

async function handleInvoicePaid(
  admin: ReturnType<typeof createAdminClient>,
  invoice: any,
) {
  const customerId = invoice.customer
  const subscriptionId = invoice.subscription
  if (!customerId) return

  const orgId = await resolveOrgByCustomer(admin, customerId)
  if (!orgId) return

  // Skip $0 invoices (trial period - no actual payment) — check BEFORE any subscription changes
  if ((invoice.amount_paid || 0) === 0) {
    console.log("[stripe-webhook] handleInvoicePaid: Skipping $0 invoice (trial) - no payment recorded:", invoice.id)
    return
  }

  const { data: localSub } = await admin
    .from("subscriptions")
    .select("id, current_period_end, status")
    .eq("organization_id", orgId)
    .single()

  if (localSub) {
    const wasPending = localSub.status === "pending"

    const newEnd = new Date(localSub.current_period_end || Date.now())
    newEnd.setMonth(newEnd.getMonth() + 1)

    await admin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_end: newEnd.toISOString(),
      })
      .eq("organization_id", orgId)

    if (wasPending) {
      await admin.rpc("unsuspend_org_projects", {
        p_organization_id: orgId,
      })

      const { data: subWithPlan } = await admin
        .from("subscriptions")
        .select("plan_id")
        .eq("organization_id", orgId)
        .single()

      if (subWithPlan?.plan_id) {
        const { data: plan } = await admin
          .from("plans")
          .select("projects_limit, assets_limit_bytes")
          .eq("id", subWithPlan.plan_id)
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
      }
    }
  }

  const { data: planForNotify } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("organization_id", orgId)
    .single()

  if (planForNotify?.plan_id) {
    const { data: p } = await admin.from("plans").select("name").eq("id", planForNotify.plan_id).single()
    if (p) {
      sendPaymentSuccessNotification(orgId, p.name, (invoice.amount_paid || 0) / 100)
        .catch((e: any) => console.warn("[stripe-webhook] Failed to send payment notification:", e))
    }
  }

  const paymentValue = (invoice.amount_paid || 0) / 100
  if (paymentValue <= 0) {
    console.log("[stripe-webhook] handleInvoicePaid: Guard prevented $0 payment insert for invoice:", invoice.id, "amount_paid:", invoice.amount_paid)
    return
  }

  try {
    console.log("[stripe-webhook] handleInvoicePaid: Inserting stripe_payment:", { invoice: invoice.id, value: paymentValue })
    await admin.from("stripe_payments").insert({
      organization_id: orgId,
      subscription_id: localSub?.id || null,
      stripe_payment_intent_id: invoice.payment_intent || invoice.id,
      status: "paid",
      value: paymentValue,
      due_date: localDateStr(),
      paid_date: localMidnightISO(),
      invoice_url: invoice.hosted_invoice_url || null,
    })
  } catch (e: any) {
    // If unique violation (already exists), that's fine
    if (!e?.message?.includes("unique") && !e?.code?.includes("23505")) {
      console.warn("[stripe-webhook] Failed to insert stripe_payment:", e?.message || e)
    }
  }
}

async function handleInvoicePaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  invoice: any,
) {
  const customerId = invoice.customer
  if (!customerId) return

  const orgId = await resolveOrgByCustomer(admin, customerId)
  if (!orgId) return

  await admin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("organization_id", orgId)

  try {
    await admin.from("stripe_payments").insert({
      organization_id: orgId,
      stripe_payment_intent_id: invoice.payment_intent || invoice.id,
      status: "failed",
      value: (invoice.amount_due || 0) / 100,
      due_date: localDateStr(),
      paid_date: null,
      invoice_url: invoice.hosted_invoice_url || null,
    })
  } catch (e: any) {
    if (!e?.message?.includes("unique") && !e?.code?.includes("23505")) {
      console.warn("[stripe-webhook] Failed to insert failed payment:", e?.message || e)
    }
  }

  await admin.rpc("suspend_org_projects", {
    p_organization_id: orgId,
  })

  const { data: planForOverdue } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("organization_id", orgId)
    .single()

  if (planForOverdue?.plan_id) {
    const { data: p } = await admin.from("plans").select("name").eq("id", planForOverdue.plan_id).single()
    if (p) {
      sendOverdueNotification(orgId, p.name, new Date().toISOString())
        .catch((e: any) => console.warn("[stripe-webhook] Failed to send overdue notification:", e))
    }
  }
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createAdminClient>,
  subscription: any,
) {
  const customerId = subscription.customer
  if (!customerId) return

  const orgId = await resolveOrgByCustomer(admin, customerId)
  if (!orgId) return

  const { data: starterPlan } = await admin
    .from("plans")
    .select("id, name, projects_limit, assets_limit_bytes")
    .eq("slug", "starter")
    .single()

  const updates: any = {
    status: "canceled",
    stripe_subscription_id: null,
  }

  if (starterPlan) {
    updates.plan_id = starterPlan.id
  }

  await admin
    .from("subscriptions")
    .update(updates)
    .eq("organization_id", orgId)

  if (starterPlan) {
    await admin
      .from("usage_limits")
      .update({
        projects_limit: starterPlan.projects_limit,
        assets_limit_bytes: starterPlan.assets_limit_bytes,
      })
      .eq("organization_id", orgId)
  }

  await admin.rpc("suspend_org_projects", {
    p_organization_id: orgId,
  })

  if (starterPlan) {
    sendSubscriptionCanceledNotification(orgId, starterPlan.name || starterPlan.id)
      .catch((e: any) => console.warn("[stripe-webhook] Failed to send cancel notification:", e))
  }
}

async function handleSubscriptionUpdated(
  admin: ReturnType<typeof createAdminClient>,
  subscription: any,
) {
  const customerId = subscription.customer
  if (!customerId) return

  const orgId = await resolveOrgByCustomer(admin, customerId)
  if (!orgId) return

  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "pending",
    incomplete_expired: "canceled",
    trialing: "trialing",
    paused: "active",
  }

  const newStatus = statusMap[subscription.status] || subscription.status

  await admin
    .from("subscriptions")
    .update({
      status: newStatus,
      stripe_subscription_id: subscription.id,
    })
    .eq("organization_id", orgId)

  if (newStatus === "past_due" || newStatus === "canceled") {
    await admin.rpc("suspend_org_projects", {
      p_organization_id: orgId,
    })
  } else if (newStatus === "active") {
    await admin.rpc("unsuspend_org_projects", {
      p_organization_id: orgId,
    })
  }
}
