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

  let query = admin.from("asaas_payments").select("id, asaas_payment_id")

  if (organization_id) {
    query = query.eq("organization_id", organization_id)
  }
  if (status) {
    query = query.eq("status", status)
  }

  const { data: payments } = await query

  if (!payments || payments.length === 0) {
    return NextResponse.json({ success: true, deleted: 0 })
  }

  // Try to delete from ASAAS as well
  await ensureAsaasKey(admin)
  if (process.env.ASAAS_API_KEY) {
    for (const payment of payments) {
      if (payment.asaas_payment_id) {
        try {
          await deletePaymentFromAsaas(payment.asaas_payment_id)
        } catch {
          // Continue deleting locally even if ASAAS fails
        }
      }
    }
  }

  const ids = payments.map((p) => p.id)

  const { error } = await admin
    .from("asaas_payments")
    .delete()
    .in("id", ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, deleted: ids.length })
}
