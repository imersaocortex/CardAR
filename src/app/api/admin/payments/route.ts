import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureAsaasKey, deletePaymentFromAsaas } from "@/lib/asaas"

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const organization_id = searchParams.get("organization_id")
  const status = searchParams.get("status")

  let totalDeleted = 0

  // Delete from asaas_payments
  let asaasQuery = admin.from("asaas_payments").select("id, asaas_payment_id")
  if (organization_id) asaasQuery = asaasQuery.eq("organization_id", organization_id)
  if (status) asaasQuery = asaasQuery.eq("status", status)

  const { data: asaasPayments } = await asaasQuery
  if (asaasPayments && asaasPayments.length > 0) {
    await ensureAsaasKey(admin)
    if (process.env.ASAAS_API_KEY) {
      for (const payment of asaasPayments) {
        if (payment.asaas_payment_id) {
          try { await deletePaymentFromAsaas(payment.asaas_payment_id) } catch {}
        }
      }
    }
    const ids = asaasPayments.map((p) => p.id)
    const { error } = await admin.from("asaas_payments").delete().in("id", ids)
    if (!error) totalDeleted += ids.length
  }

  // Delete from stripe_payments
  let stripeQuery = admin.from("stripe_payments").select("id")
  if (organization_id) stripeQuery = stripeQuery.eq("organization_id", organization_id)
  if (status) stripeQuery = stripeQuery.eq("status", status)

  const { data: stripePayments } = await stripeQuery
  if (stripePayments && stripePayments.length > 0) {
    const ids = stripePayments.map((p) => p.id)
    const { error } = await admin.from("stripe_payments").delete().in("id", ids)
    if (!error) totalDeleted += ids.length
  }

  return NextResponse.json({ success: true, deleted: totalDeleted })
}
