import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { startAgreement, cancelAgreement, reconcileAsaasAgreement, type Agreement } from "@/lib/payments/service"

export async function GET() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const { data: membership } = await client.from("organization_members").select("organization_id, role").eq("user_id", user.id).limit(1).single()
  if (!membership) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })
  const org = membership.organization_id
  const [subscription, payments, invoices, usage, agreement, plans] = await Promise.all([
    client.from("subscriptions").select("*, plans(*)").eq("organization_id", org).single(),
    client.from("billing_payments").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(100),
    client.from("billing_invoices").select("*").eq("organization_id", org).order("due_date", { ascending: false }).limit(20),
    client.from("usage_limits").select("*").eq("organization_id", org).single(),
    client.from("billing_agreements").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("plans").select("*").eq("active", true).order("price"),
  ])
  if ([subscription, payments, invoices, usage, agreement, plans].some((result) => result.error)) return NextResponse.json({ error: "Não foi possível carregar o faturamento. Confira a migração 028." }, { status: 503 })
  return NextResponse.json({ subscription: subscription.data, payments: payments.data, invoices: invoices.data, usage: usage.data,
    agreement: agreement.data, plans: plans.data, canManage: ["owner", "admin"].includes(membership.role) })
}
const schema = z.object({ action: z.enum(["upgrade", "cancel", "sync"]), plan_id: z.string().uuid().optional(), payment_provider: z.literal("asaas").optional() })
export async function POST(request: Request) {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const { data: membership } = await client.from("organization_members").select("organization_id, role").eq("user_id", user.id).limit(1).single()
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "Somente responsáveis pela organização podem gerenciar a assinatura" }, { status: 403 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Solicitação inválida" }, { status: 400 })
  try {
    if (parsed.data.action === "upgrade") {
      if (!parsed.data.plan_id || parsed.data.payment_provider !== "asaas") return NextResponse.json({ error: "Escolha o plano Pix Automático" }, { status: 400 })
      const agreement = await startAgreement(membership.organization_id, user.id, parsed.data.plan_id)
      return NextResponse.json({ agreement, pix_code: agreement.pix_code })
    }
    const { data } = await createAdminClient().from("billing_agreements").select("*")
      .eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (!data || data.provider !== "asaas") return NextResponse.json({ error: "Não há assinatura Asaas para gerenciar" }, { status: 404 })
    const agreement = data as Agreement
    if (parsed.data.action === "cancel") await cancelAgreement(agreement)
    else await reconcileAsaasAgreement(agreement)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação" }, { status: 409 })
  }
}
