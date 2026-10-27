import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { reconcileAsaasAgreement, type Agreement } from "@/lib/payments/service"
import { sendBillingNotifications } from "@/lib/payments/notifications"
import { reconcileMercadoPagoAgreement } from "@/lib/payments/mercado-pago"

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const admin = createAdminClient()
  const failures: string[] = []
  const failedAgreements = new Set<string>()
  const reconciledAgreements = new Set<string>()
  const { data, error } = await admin.from("billing_agreements").select("*").eq("provider", "asaas")
    .neq("status", "canceled").order("last_reconciled_at", { ascending: true, nullsFirst: true }).order("id").limit(30)
  if (error) return NextResponse.json({ error: "Falha ao consultar assinaturas" }, { status: 503 })
  for (const agreement of (data || []) as Agreement[]) {
    try {
      await reconcileAsaasAgreement(agreement)
      const { error: recordError } = await admin.from("billing_agreements")
        .update({ last_reconciled_at: new Date().toISOString() }).eq("id", agreement.id)
      if (recordError) throw recordError
      reconciledAgreements.add(agreement.id)
    } catch {
      failures.push(agreement.id)
      failedAgreements.add(agreement.id)
      await admin.from("billing_agreements").update({ last_reconciled_at: new Date().toISOString() }).eq("id", agreement.id)
    }
  }
  const mpResult = await admin.from("billing_agreements").select("*").eq("provider", "mercado_pago")
    .neq("status", "canceled").order("last_reconciled_at", { ascending: true, nullsFirst: true }).order("id").limit(30)
  if (mpResult.error) return NextResponse.json({ error: "Falha ao consultar assinaturas Mercado Pago" }, { status: 503 })
  for (const agreement of (mpResult.data || []) as Agreement[]) {
    try {
      await reconcileMercadoPagoAgreement(agreement)
      const { error: recordError } = await admin.from("billing_agreements")
        .update({ last_reconciled_at: new Date().toISOString() }).eq("id", agreement.id)
      if (recordError) throw recordError
      reconciledAgreements.add(agreement.id)
    } catch {
      failures.push(agreement.id)
      failedAgreements.add(agreement.id)
      await admin.from("billing_agreements").update({ last_reconciled_at: new Date().toISOString() }).eq("id", agreement.id)
    }
  }
  const { data: expired, error: expirationError } = await admin.from("subscriptions")
    .select("id, billing_agreement_id, payment_provider").in("payment_provider", ["asaas", "mercado_pago"]).eq("status", "active")
    .lt("current_period_end", new Date().toISOString()).order("current_period_end", { ascending: true }).limit(100)
  if (expirationError) return NextResponse.json({ error: "Falha ao verificar períodos" }, { status: 503 })
  const expiredAgreementIds = (expired || []).map((item) => item.billing_agreement_id).filter((id): id is string => !!id)
  const canceledAgreements = new Set<string>()
  if (expiredAgreementIds.length) {
    const { data: canceled, error: canceledError } = await admin.from("billing_agreements")
      .select("id").in("id", expiredAgreementIds).in("provider", ["asaas", "mercado_pago"]).eq("status", "canceled")
    if (canceledError) return NextResponse.json({ error: "Falha ao consultar cancelamentos" }, { status: 503 })
    for (const agreement of canceled || []) canceledAgreements.add(agreement.id)
  }
  for (const subscription of expired || []) {
    const agreementId = subscription.billing_agreement_id
    if (!agreementId || failedAgreements.has(agreementId) ||
        (!reconciledAgreements.has(agreementId) && !canceledAgreements.has(agreementId))) continue
    const { error: updateError } = await admin.rpc(subscription.payment_provider === "asaas" ? "expire_asaas_subscription" : "expire_mercado_pago_subscription", { p_subscription: subscription.id })
    if (updateError) failures.push(subscription.id)
  }
  let notifications = { upcoming: 0, overdue: 0 }
  try { notifications = await sendBillingNotifications() }
  catch { failures.push("notifications") }
  return NextResponse.json({ processed: (data?.length || 0) + (mpResult.data?.length || 0), notifications, failures }, { status: failures.length ? 503 : 200 })
}
