import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { asaasWebhookSchema } from "@/lib/schemas"
import {
  sendPaymentSuccessNotification,
  sendOverdueNotification,
} from "@/lib/evolution"
import { verifyWebhookSignature } from "@/lib/asaas"

async function ensureWebhookSecret() {
  if (process.env.ASAAS_WEBHOOK_SECRET) return
  const admin = createAdminClient()
  const { data: settings } = await admin
    .from("system_settings")
    .select("asaas")
    .eq("id", 1)
    .maybeSingle()
  const config = settings?.asaas as Record<string, any> | undefined
  if (!config) return
  const env = config.environment || "debug"
  const secret = config[`${env}_webhook_secret`] as string | undefined
  if (secret) {
    process.env.ASAAS_WEBHOOK_SECRET = secret
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  const signature = request.headers.get("asaas-signature") || ""
  const admin = createAdminClient()

  // Verify webhook signature (load secret from DB if not in env)
  await ensureWebhookSecret()
  if (!verifyWebhookSignature(JSON.stringify(body), signature)) {
    console.warn("[webhook] Invalid ASAAS signature")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // Idempotency check
  const eventId = body.event?.split("_")?.slice(1)?.join("_") || body.payment?.id || body.subscription?.id || "unknown"

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
    event_type: body.event || "unknown",
    raw_body: body,
  })

  const eventType: string = body.event || ""

  try {
    if (eventType.includes("PAYMENT") && body.payment) {
      await handlePaymentEvent(admin, body.payment)
    }

    if (eventType.includes("SUBSCRIPTION") && body.subscription) {
      await handleSubscriptionEvent(admin, body.subscription)
    }

    // Mark as processed
    await admin
      .from("webhook_events")
      .update({ processed: true })
      .eq("source", "asaas")
      .eq("event_id", eventId)
  } catch (err) {
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
  await admin
    .from("subscriptions")
    .update({ asaas_subscription_id: asaasSubscriptionId })
    .eq("id", orgSub.id)

  return { organization_id: orgSub.organization_id, plan_id: orgSub.plan_id }
}

async function handlePaymentEvent(admin: ReturnType<typeof createAdminClient>, payment: any) {
  if (!payment.subscription) return

  // Resolve org first (needed for payment insert FK)
  const sub = await resolveSubscription(admin, payment.subscription, payment.customer)
  if (!sub) return

  // Get local subscription UUID for FK reference
  const { data: localSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", sub.organization_id)
    .single()

  // Upsert payment record (org_id and local sub_id required)
  const { data: existingPayment } = await admin
    .from("asaas_payments")
    .select("id")
    .eq("asaas_payment_id", payment.id)
    .single()

  const paymentData: Record<string, any> = {
    organization_id: sub.organization_id,
    subscription_id: localSub?.id || null,
    status: payment.status,
    value: payment.value,
    due_date: payment.dueDate,
    paid_date: payment.paidDate || null,
    invoice_url: payment.invoiceUrl || null,
  }

  if (existingPayment) {
    await admin
      .from("asaas_payments")
      .update(paymentData)
      .eq("asaas_payment_id", payment.id)
  } else {
    paymentData.asaas_payment_id = payment.id
    await admin
      .from("asaas_payments")
      .insert(paymentData)
  }

  if (payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("current_period_end, status, plan_id")
      .eq("organization_id", sub.organization_id)
      .single()

    if (currentSub) {
      const updates: Record<string, any> = { status: "active" }

      // Extend current period by 1 month
      const newEnd = new Date(currentSub.current_period_end)
      newEnd.setMonth(newEnd.getMonth() + 1)
      updates.current_period_end = newEnd.toISOString()

      await admin
        .from("subscriptions")
        .update(updates)
        .eq("organization_id", sub.organization_id)

      // If this was a pending subscription (first payment), update usage limits
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

      // Unsuspend projects if they were suspended
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
      sendPaymentSuccessNotification(
        sub.organization_id,
        plan.name,
        payment.value || 0,
      )
    }
  }

  if (payment.status === "OVERDUE") {
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("organization_id", sub.organization_id)

    // Suspend all active projects
    await admin.rpc("suspend_org_projects", {
      p_organization_id: sub.organization_id,
    })

    // Send overdue notification via WhatsApp
    const { data: plan } = await admin
      .from("plans")
      .select("name")
      .eq("id", sub.plan_id)
      .single()

    if (plan) {
      sendOverdueNotification(
        sub.organization_id,
        plan.name,
        payment.dueDate || new Date().toISOString(),
      )
    }
  }
}

async function handleSubscriptionEvent(admin: ReturnType<typeof createAdminClient>, subscription: any) {
  const statusMap: Record<string, string> = {
    ACTIVE: "active",
    OVERDUE: "past_due",
    CANCELED: "canceled",
    EXPIRED: "canceled",
  }

  const newStatus = statusMap[subscription.status] || subscription.status.toLowerCase()

  // Resolve org (with customer fallback for checkout-created subscriptions)
  const sub = await resolveSubscription(admin, subscription.id, subscription.customer)

  await admin
    .from("subscriptions")
    .update({ status: newStatus })
    .eq("asaas_subscription_id", subscription.id)

  // Suspend or unsuspend projects based on new status
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
