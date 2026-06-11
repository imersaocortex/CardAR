import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureAsaasKey, deletePaymentFromAsaas } from "@/lib/asaas"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params

  const { data: payment } = await admin
    .from("asaas_payments")
    .select("asaas_payment_id")
    .eq("id", id)
    .single()

  if (!payment) {
    return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 })
  }

  // Try to delete from ASAAS as well
  await ensureAsaasKey(admin)
  if (process.env.ASAAS_API_KEY && payment.asaas_payment_id) {
    try {
      await deletePaymentFromAsaas(payment.asaas_payment_id)
    } catch {
      console.warn("[admin] Could not delete from ASAAS, removing locally only")
    }
  }

  const { error } = await admin
    .from("asaas_payments")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
