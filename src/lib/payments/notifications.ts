import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendOverdueNotification, sendUpcomingPaymentNotification } from "@/lib/evolution"
import { reconcileAsaasPayment } from "./service"

interface Invoice {
  id: string; external_id: string; organization_id: string; agreement_id: string
  amount_cents: number; due_date: string; status: string
}
async function claim(id: string, field: "upcoming" | "overdue") {
  const column = `${field}_claimed_at`
  const sent = `${field}_sent_at`
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data } = await createAdminClient().from("billing_invoices")
    .update({ [column]: new Date().toISOString() }).eq("id", id).is(sent, null)
    .or(`${column}.is.null,${column}.lt.${stale}`).select("id").maybeSingle()
  return !!data
}
async function finish(id: string, field: "upcoming" | "overdue", success: boolean) {
  const column = `${field}_claimed_at`
  const sent = `${field}_sent_at`
  const { error } = await createAdminClient().from("billing_invoices")
    .update({ [column]: null, ...(success ? { [sent]: new Date().toISOString() } : {}) }).eq("id", id)
  if (error) throw new Error("Não foi possível registrar a notificação")
}
export async function sendBillingNotifications() {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const next = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await admin.from("billing_invoices").select("id, external_id, organization_id, agreement_id, amount_cents, due_date, status")
    .eq("provider", "asaas").gte("due_date", today).lte("due_date", next).is("upcoming_sent_at", null).limit(100)
  if (error) throw new Error("Não foi possível consultar faturas próximas")
  let upcoming = 0
  for (const invoice of (data || []) as Invoice[]) {
    if (["paid", "refunded", "CONFIRMED", "RECEIVED"].includes(invoice.status)) continue
    await reconcileAsaasPayment(invoice.external_id)
    const { data: current } = await admin.from("billing_invoices").select("status").eq("id", invoice.id).single()
    if (!current || ["paid", "refunded"].includes(current.status) || !await claim(invoice.id, "upcoming")) continue
    try {
      const { data: agreement } = await admin.from("billing_agreements").select("plan_id").eq("id", invoice.agreement_id).single()
      const { data: plan } = await admin.from("plans").select("name").eq("id", agreement?.plan_id).single()
      const sent = await sendUpcomingPaymentNotification(invoice.organization_id, plan?.name || "assinatura", invoice.amount_cents / 100, invoice.due_date)
      await finish(invoice.id, "upcoming", sent)
      if (sent) upcoming++
    } catch (cause) { await finish(invoice.id, "upcoming", false); throw cause }
  }
  const { data: overdueRows, error: overdueError } = await admin.from("billing_invoices")
    .select("id, external_id, organization_id, agreement_id, amount_cents, due_date, status")
    .eq("provider", "asaas").lt("due_date", today).is("overdue_sent_at", null).limit(100)
  if (overdueError) throw new Error("Não foi possível consultar faturas vencidas")
  let overdue = 0
  for (const invoice of (overdueRows || []) as Invoice[]) {
    if (["paid", "refunded", "CONFIRMED", "RECEIVED"].includes(invoice.status)) continue
    await reconcileAsaasPayment(invoice.external_id)
    const { data: current } = await admin.from("billing_invoices").select("status").eq("id", invoice.id).single()
    if (!current || ["paid", "refunded"].includes(current.status)) continue
    const { data: subscription } = await admin.from("subscriptions").select("status")
      .eq("organization_id", invoice.organization_id).eq("billing_agreement_id", invoice.agreement_id).maybeSingle()
    if (!subscription || !["past_due", "canceled"].includes(subscription.status) || !await claim(invoice.id, "overdue")) continue
    try {
      const { data: agreement } = await admin.from("billing_agreements").select("plan_id").eq("id", invoice.agreement_id).single()
      const { data: plan } = await admin.from("plans").select("name").eq("id", agreement?.plan_id).single()
      const sent = await sendOverdueNotification(invoice.organization_id, plan?.name || "assinatura", invoice.due_date)
      await finish(invoice.id, "overdue", sent)
      if (sent) overdue++
    } catch (cause) { await finish(invoice.id, "overdue", false); throw cause }
  }
  return { upcoming, overdue }
}
