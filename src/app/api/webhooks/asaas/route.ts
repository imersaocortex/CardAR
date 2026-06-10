import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { asaasWebhookSchema } from "@/lib/schemas"
import {
  sendPaymentSuccessNotification,
  sendOverdueNotification,
} from "@/lib/evolution"

export async function POST(request: Request) {
  const body = await request.json()
  const signature = request.headers.get("asaas-signature") || ""
  const admin = createAdminClient()

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

async function handlePaymentEvent(admin: ReturnType<typeof createAdminClient>, payment: any) {
  const { data: existingPayment } = await admin
    .from("asaas_payments")
    .select("id")
    .eq("asaas_payment_id", payment.id)
    .single()

  if (existingPayment) {
    await admin
      .from("asaas_payments")
      .update({
        status: payment.status,
        paid_date: payment.paidDate || null,
        invoice_url: payment.invoiceUrl || null,
      })
      .eq("asaas_payment_id", payment.id)
  }

  // Find org by customer
  if (payment.subscription) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("organization_id, plan_id")
      .eq("asaas_subscription_id", payment.subscription)
      .single()

    if (sub) {
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

  const { data: sub } = await admin
    .from("subscriptions")
    .select("organization_id")
    .eq("asaas_subscription_id", subscription.id)
    .single()

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
