import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  ensureAsaasKey,
  getPaymentsByCustomer,
  loadWebhookSecret,
} from "@/lib/asaas"
import {
  sendPaymentSuccessNotification,
  sendOverdueNotification,
} from "@/lib/evolution"

export async function POST(request: Request) {
  const body = await request.json()
  const admin = createAdminClient()
  const eventType: string = body.event || ""

  console.log("[webhook] Received event:", eventType, "has payment:", !!body.payment, "has subscription:", !!body.subscription, "has checkout:", !!body.checkout)

  // Ensure ASAAS API key loaded from DB
  await ensureAsaasKey(admin)
  await loadWebhookSecret(admin)

  // Idempotency check — use ASAAS webhook event ID if available
  const eventId = body.id || body.payment?.id || body.subscription?.id || body.checkout?.id || `evt_${Date.now()}`

  const { data: existing } = await admin
    .from("webhook_events")
    .select("id")
    .eq("source", "asaas")
    .eq("event_id", eventId)
    .single()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Save raw event
  await admin.from("webhook_events").insert({
    source: "asaas",
    event_id: eventId,
    event_type: eventType,
    raw_body: body,
  })

  try {
    if (body.payment) {
      await handlePaymentEvent(admin, body.payment)
    }

    if (body.subscription) {
      await handleSubscriptionEvent(admin, body.subscription)
    }

    if (body.checkout && eventType === "CHECKOUT_PAID") {
      console.log("[webhook] CHECKOUT_PAID - fetching payments for customer:", body.checkout.customer)
      await handleCheckoutPaid(admin, body.checkout)
    }

    if (body.checkout && eventType !== "CHECKOUT_PAID" && !body.payment && !body.subscription) {
      console.log("[webhook] Checkout event only (no payment/sub data):", body.checkout.id, eventType)
    }

    // Mark as processed
    await admin
      .from("webhook_events")
      .update({ processed: true })
      .eq("source", "asaas")
      .eq("event_id", eventId)
  } catch (err) {
    console.error("[webhook] Processing error:", err)
    await admin
      .from("webhook_events")
      .update({
        processed: false,
        processing_error: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("source", "asaas")
      .eq("event_id", eventId)
  }

  return NextResponse.json({ received: true })
}

type OrgSubscription = { organization_id: string; plan_id: string }

async function resolveSubscription(
  admin: ReturnType<typeof createAdminClient>,
  asaasSubscriptionId: string,
  asaasCustomerId?: string,
): Promise<OrgSubscription | null> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("organization_id, plan_id")
    .eq("asaas_subscription_id", asaasSubscriptionId)
    .single()

  if (sub) return sub

  // Fallback: checkout-created subscription, find org by customer
  if (!asaasCustomerId) return null

  const { data: customer } = await admin
    .from("asaas_customers")
    .select("organization_id")
    .eq("asaas_customer_id", asaasCustomerId)
    .single()

  if (!customer) return null

  const { data: orgSub } = await admin
    .from("subscriptions")
    .select("id, organization_id, plan_id")
    .eq("organization_id", customer.organization_id)
    .single()

  if (!orgSub) return null

  // Save ASAAS sub ID for future webhook lookups
  const { error: updateErr } = await admin
    .from("subscriptions")
    .update({ asaas_subscription_id: asaasSubscriptionId })
    .eq("id", orgSub.id)

  if (updateErr) {
    console.error("[webhook] Failed to save asaas_subscription_id:", updateErr)
    return null
  }

  console.log("[webhook] Saved asaas_subscription_id:", asaasSubscriptionId, "for org:", customer.organization_id)

  return { organization_id: orgSub.organization_id, plan_id: orgSub.plan_id }
}

async function handlePaymentEvent(admin: ReturnType<typeof createAdminClient>, payment: any) {
  if (!payment.subscription) {
    console.log("[webhook] Payment has no subscription, skipping:", payment.id)
    return
  }

  console.log("[webhook] Processing payment:", payment.id, "sub:", payment.subscription, "status:", payment.status)

  const sub = await resolveSubscription(admin, payment.subscription, payment.customer)
  if (!sub) {
    console.error("[webhook] Could not resolve subscription for payment:", payment.id)
    return
  }

  // Get local subscription UUID for FK reference
  const { data: localSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", sub.organization_id)
    .single()

  // Upsert payment record
  const { data: existingPayment } = await admin
    .from("asaas_payments")
    .select("id")
    .eq("asaas_payment_id", payment.id)
    .single()

  const paymentData: Record<string, any> = {
    organization_id: sub.organization_id,
    subscription_id: localSub?.id || null,
    status: payment.status || "PENDING",
    value: payment.value || 0,
    due_date: payment.dueDate || new Date().toISOString().split("T")[0],
    paid_date: payment.paidDate || null,
    invoice_url: payment.invoiceUrl || null,
  }

  if (existingPayment) {
    const { error } = await admin
      .from("asaas_payments")
      .update(paymentData)
      .eq("asaas_payment_id", payment.id)
    if (error) console.error("[webhook] Failed to update payment:", error)
  } else {
    paymentData.asaas_payment_id = payment.id
    const { error } = await admin
      .from("asaas_payments")
      .insert(paymentData)
    if (error) {
      console.error("[webhook] Failed to insert payment:", error)
      return
    }
    console.log("[webhook] Payment record created:", payment.id)
  }

  if (payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
    console.log("[webhook] Payment received/confirmed for org:", sub.organization_id)

    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("current_period_end, status, plan_id")
      .eq("organization_id", sub.organization_id)
      .single()

    if (currentSub) {
      const updates: Record<string, any> = { status: "active" }

      const newEnd = new Date(currentSub.current_period_end || Date.now())
      newEnd.setMonth(newEnd.getMonth() + 1)
      updates.current_period_end = newEnd.toISOString()

      await admin
        .from("subscriptions")
        .update(updates)
        .eq("organization_id", sub.organization_id)

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
            .eq("organization_id", sub.organization_id)
        }
      }

      await admin.rpc("unsuspend_org_projects", {
        p_organization_id: sub.organization_id,
      })
    }

    // Send payment success notification via WhatsApp
    const { data: plan } = await admin
      .from("plans")
      .select("name")
      .eq("id", sub.plan_id)
      .single()

    if (plan) {
      try {
        await sendPaymentSuccessNotification(
          sub.organization_id,
          plan.name,
          payment.value || 0,
        )
        console.log("[webhook] Payment notification sent for org:", sub.organization_id)
      } catch (e) {
        console.error("[webhook] Failed to send payment notification:", e)
      }
    }
  }

  if (payment.status === "OVERDUE") {
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("organization_id", sub.organization_id)

    await admin.rpc("suspend_org_projects", {
      p_organization_id: sub.organization_id,
    })

    const { data: plan } = await admin
      .from("plans")
      .select("name")
      .eq("id", sub.plan_id)
      .single()

    if (plan) {
      try {
        await sendOverdueNotification(
          sub.organization_id,
          plan.name,
          payment.dueDate || new Date().toISOString(),
        )
      } catch (e) {
        console.error("[webhook] Failed to send overdue notification:", e)
      }
    }
  }
}

async function handleSubscriptionEvent(admin: ReturnType<typeof createAdminClient>, subscription: any) {
  console.log("[webhook] Processing subscription event:", subscription.id, "status:", subscription.status)

  const statusMap: Record<string, string> = {
    ACTIVE: "active",
    OVERDUE: "past_due",
    CANCELED: "canceled",
    EXPIRED: "canceled",
  }

  const newStatus = statusMap[subscription.status] || subscription.status.toLowerCase()

  const sub = await resolveSubscription(admin, subscription.id, subscription.customer)

  const { error: updateErr } = await admin
    .from("subscriptions")
    .update({ status: newStatus })
    .eq("asaas_subscription_id", subscription.id)

  if (updateErr) {
    console.error("[webhook] Failed to update subscription status:", updateErr)
  }

  if (sub) {
    if (newStatus === "past_due" || newStatus === "canceled") {
      await admin.rpc("suspend_org_projects", {
        p_organization_id: sub.organization_id,
      })
    } else if (newStatus === "active") {
      await admin.rpc("unsuspend_org_projects", {
        p_organization_id: sub.organization_id,
      })
    }
  }
}

async function handleCheckoutPaid(admin: ReturnType<typeof createAdminClient>, checkout: any) {
  const customerId = checkout.customer
  if (!customerId) {
    console.error("[webhook] CHECKOUT_PAID has no customer ID")
    return
  }

  // Resolve org from customer
  const { data: customer } = await admin
    .from("asaas_customers")
    .select("organization_id")
    .eq("asaas_customer_id", customerId)
    .single()

  if (!customer) {
    console.error("[webhook] CHECKOUT_PAID - unknown customer:", customerId)
    return
  }

  // Fetch payments from ASAAS for this customer
  const payments = await getPaymentsByCustomer(customerId)
  if (!payments.length) {
    console.log("[webhook] CHECKOUT_PAID - no payments found for customer:", customerId)
    return
  }

  // Find the most recent RECEIVED/CONFIRMED payment with a subscription
  const paidPayment = payments.find(
    (p: any) => (p.status === "RECEIVED" || p.status === "CONFIRMED") && p.subscription
  )

  if (!paidPayment) {
    console.log("[webhook] CHECKOUT_PAID - no paid payment with subscription found for customer:", customerId, "payments:", payments.map((p: any) => ({ id: p.id, status: p.status, sub: p.subscription })))
    return
  }

  console.log("[webhook] CHECKOUT_PAID - processing payment:", paidPayment.id, "sub:", paidPayment.subscription)

  if (!paidPayment.subscription) {
    console.log("[webhook] CHECKOUT_PAID - payment has no subscription ID")
    return
  }

  // Resolve subscription (this saves asaas_subscription_id to the local subscription)
  const sub = await resolveSubscription(admin, paidPayment.subscription, customerId)
  if (!sub) {
    console.error("[webhook] CHECKOUT_PAID - could not resolve subscription for payment:", paidPayment.id)
    return
  }

  // Process the payment using the existing handler
  await handlePaymentEvent(admin, paidPayment)
}
