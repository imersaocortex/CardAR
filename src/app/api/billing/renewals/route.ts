import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPixCharge, reconcilePayPal, reconcilePixCharge, type Agreement, type Charge } from "@/lib/payments/service"
import { efiRequest, type PixRecurrence } from "@/lib/payments/efi"

export async function GET(request: Request) {
  if (process.env.BILLING_V2_ENABLED !== "true") return NextResponse.json({ skipped: true, reason: "Faturamento ainda não habilitado" })
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const admin = createAdminClient()
  const failures: string[] = []
  const { data, error } = await admin.from("billing_agreements").select("*").neq("status", "canceled")
    .order("last_reconciled_at", { ascending: true, nullsFirst: true }).order("id").limit(30)
  if (error) return NextResponse.json({ error: "Falha ao consultar assinaturas" }, { status: 503 })
  for (const agreement of (data ?? []) as Agreement[]) {
    try {
      if (agreement.provider === "paypal") await reconcilePayPal(agreement)
      else {
        const { data: charges, error: chargeError } = await admin.from("billing_charges").select("*").eq("agreement_id", agreement.id).eq("status", "pending").limit(10)
        if (chargeError) throw chargeError
        for (const charge of (charges ?? []) as Charge[]) await reconcilePixCharge(charge, agreement)
        if (agreement.pix_mode === "automatic" && agreement.external_id && agreement.paid_until) {
          const remote = await efiRequest<PixRecurrence>(`/v2/rec/${encodeURIComponent(agreement.external_id)}`)
          const daysLeft = (new Date(agreement.paid_until).getTime() - Date.now()) / 86400000
          if (remote.status === "APROVADA" && daysLeft >= 3 && daysLeft <= 10) await createPixCharge(agreement, true)
        }
      }
      const { error: recordError } = await admin.from("billing_agreements").update({ last_reconciled_at: new Date().toISOString() }).eq("id", agreement.id)
      if (recordError) throw recordError
    } catch {
      failures.push(agreement.id)
      // A persistently failing provider must not starve all later agreements.
      await admin.from("billing_agreements").update({ last_reconciled_at: new Date().toISOString() }).eq("id", agreement.id)
    }
  }
  const { data: expired, error: expirationError } = await admin.from("subscriptions").select("id, organization_id, cancel_at_period_end")
    .in("payment_provider", ["paypal", "efi"]).eq("status", "active").lt("current_period_end", new Date().toISOString())
  if (expirationError) return NextResponse.json({ error: "Falha ao verificar períodos" }, { status: 503 })
  for (const subscription of expired ?? []) {
    const { error: updateError } = await admin.from("subscriptions").update({ status: subscription.cancel_at_period_end ? "canceled" : "past_due" }).eq("id", subscription.id).lt("current_period_end", new Date().toISOString())
    if (updateError) { failures.push(subscription.id); continue }
    const { error: suspensionError } = await admin.rpc("suspend_org_projects", { p_organization_id: subscription.organization_id })
    if (suspensionError) failures.push(subscription.id)
  }
  return NextResponse.json({ processed: data?.length ?? 0, failures }, { status: failures.length ? 503 : 200 })
}
