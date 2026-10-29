import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cancelAgreement, reconcileAsaasAgreement, type Agreement } from "@/lib/payments/service"
import { startMercadoPagoAgreement, cancelMercadoPagoAgreement, reconcileMercadoPagoAgreement } from "@/lib/payments/mercado-pago"
import { startSyncPayAgreement, cancelSyncPayAgreement, reconcileSyncPayAgreement, type SyncPayAgreement } from "@/lib/payments/syncpay"
import { isIP } from "node:net"

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
    client.from("billing_invoices").select("*").eq("organization_id", org).order("due_date", { ascending: false }).order("created_at", { ascending: false }).limit(20),
    client.from("usage_limits").select("*").eq("organization_id", org).single(),
    client.from("billing_agreements").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("plans").select("*").eq("active", true).order("price"),
  ])
  if ([subscription, payments, invoices, usage, agreement, plans].some((result) => result.error)) return NextResponse.json({ error: "Não foi possível carregar o faturamento. Confira a migração 028." }, { status: 503 })
  const links = await createAdminClient().from("syncpay_plan_links").select("plan_id, method")
  return NextResponse.json({ subscription: subscription.data, payments: payments.data, invoices: invoices.data, usage: usage.data,
    agreement: agreement.data, plans: plans.data?.map(plan => ({ ...plan, syncpay_methods: (links.data || []).filter(link => link.plan_id === plan.id).map(link => link.method) })), canManage: ["owner", "admin"].includes(membership.role) })
}
const schema = z.object({ action: z.enum(["upgrade", "cancel", "sync"]), plan_id: z.string().uuid().optional(),
  payment_provider: z.enum(["syncpay", "mercado_pago"]).optional(), syncpay_method: z.enum(["pix_automatico", "credit_card"]).optional(),
  card_token: z.string().max(10000).optional(), recurring_consent: z.boolean().optional() }).strict()
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
      if (!parsed.data.plan_id || !parsed.data.payment_provider) return NextResponse.json({ error: "Escolha o plano e o meio de pagamento" }, { status: 400 })
      if (parsed.data.payment_provider === "syncpay" && (!parsed.data.syncpay_method || !parsed.data.recurring_consent)) return NextResponse.json({ error: "Escolha a modalidade e confirme a autorização de cobrança recorrente" }, { status: 400 })
      const forwarded = (request.headers.get("x-vercel-forwarded-for") || "").split(",")[0].trim()
      const agreement = parsed.data.payment_provider === "syncpay"
        ? await startSyncPayAgreement(membership.organization_id, user.id, parsed.data.plan_id, parsed.data.syncpay_method!, parsed.data.card_token, isIP(forwarded) ? forwarded : undefined)
        : await startMercadoPagoAgreement(membership.organization_id, user.id, parsed.data.plan_id)
      return NextResponse.json({ agreement, pix_code: agreement.pix_code })
    }
    const { data } = await createAdminClient().from("billing_agreements").select("*")
      .eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (!data || !["asaas", "mercado_pago", "syncpay"].includes(data.provider)) return NextResponse.json({ error: "Não há assinatura para gerenciar" }, { status: 404 })
    const agreement = data as Agreement
    if (parsed.data.action === "cancel") {
      if (agreement.provider === "asaas") await cancelAgreement(agreement)
      else if (agreement.provider === "syncpay") await cancelSyncPayAgreement(agreement as SyncPayAgreement)
      else await cancelMercadoPagoAgreement(agreement)
    } else if (agreement.provider === "asaas") await reconcileAsaasAgreement(agreement)
    else if (agreement.provider === "syncpay") await reconcileSyncPayAgreement(agreement as SyncPayAgreement)
    else await reconcileMercadoPagoAgreement(agreement)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação" }, { status: 409 })
  }
}
