import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendUpcomingPaymentNotification } from "@/lib/evolution"

export async function GET() {
  const admin = createAdminClient()

  const now = new Date()
  // Find payments due in the next 3 days (upcoming charges)
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  const today = now.toISOString().split("T")[0]

  // Get all ASAAS payments that are PENDING and due soon (3-5 days from now)
  const { data: payments } = await admin
    .from("asaas_payments")
    .select("id, organization_id, value, due_date, asaas_payment_id")
    .eq("status", "PENDING")
    .gte("due_date", today)
    .lte("due_date", threeDaysFromNow)
    .limit(100)

  if (!payments || payments.length === 0) {
    return NextResponse.json({ success: true, notified: 0, message: "Nenhuma cobrança próxima do vencimento" })
  }

  let notified = 0
  const results: { org: string; payment: string; sent: boolean; error?: string }[] = []

  for (const payment of payments) {
    try {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("plan_id")
        .eq("organization_id", payment.organization_id)
        .single()

      if (!sub) {
        results.push({ org: payment.organization_id, payment: payment.asaas_payment_id, sent: false, error: "Sem assinatura" })
        continue
      }

      const { data: plan } = await admin
        .from("plans")
        .select("name")
        .eq("id", sub.plan_id)
        .single()

      const sent = await sendUpcomingPaymentNotification(
        payment.organization_id,
        plan?.name || "desconhecido",
        payment.value,
        payment.due_date,
      )

      if (sent) notified++
      results.push({ org: payment.organization_id, payment: payment.asaas_payment_id, sent, error: sent ? undefined : "Falha ao enviar" })
    } catch (err: any) {
      results.push({ org: payment.organization_id, payment: payment.asaas_payment_id, sent: false, error: err.message })
    }
  }

  return NextResponse.json({ success: true, notified, total: payments.length, results })
}
