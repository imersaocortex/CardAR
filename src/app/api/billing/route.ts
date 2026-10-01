import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { startAgreement, cancelAgreement, createPixCharge, reconcilePayPal, reconcilePixCharge, type Agreement, type Charge } from "@/lib/payments/service"

export async function GET() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const { data: membership } = await client.from("organization_members").select("organization_id, role").eq("user_id", user.id).limit(1).single()
  if (!membership) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 })
  const org = membership.organization_id
  const [subscription, payments, usage, agreement, charges, plans] = await Promise.all([
    client.from("subscriptions").select("*, plans(*)").eq("organization_id", org).single(),
    client.from("billing_payments").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(100),
    client.from("usage_limits").select("*").eq("organization_id", org).single(),
    client.from("billing_agreements").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("billing_charges").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(5),
    client.from("plans").select("*").eq("active", true).order("price"),
  ])
  if ([subscription, payments, usage, agreement, charges, plans].some((result) => result.error)) return NextResponse.json({ error: "Não foi possível carregar o faturamento. Tente novamente." }, { status: 503 })
  return NextResponse.json({ subscription: subscription.data, payments: payments.data, usage: usage.data, agreement: agreement.data, charges: charges.data, plans: plans.data, canManage: ["owner", "admin"].includes(membership.role) })
}
const schema = z.object({ action: z.enum(["upgrade", "cancel", "reset", "sync", "renew", "checkout_success"]), plan_id: z.string().uuid().optional(), payment_provider: z.enum(["paypal", "efi"]).optional() })
export async function POST(request: Request) {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const { data: membership } = await client.from("organization_members").select("organization_id, role").eq("user_id", user.id).limit(1).single()
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "Somente responsáveis pela organização podem gerenciar a assinatura" }, { status: 403 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Solicitação inválida" }, { status: 400 })
  const { action, plan_id, payment_provider } = parsed.data
  try {
    if (action === "upgrade") {
      if (!plan_id || !payment_provider) return NextResponse.json({ error: "Escolha o plano e a forma de pagamento" }, { status: 400 })
      const agreement = await startAgreement(membership.organization_id, user.id, plan_id, payment_provider)
      return NextResponse.json({ agreement, checkout_url: agreement.checkout_url, pix_code: agreement.pix_code })
    }
    const admin = createAdminClient()
    const { data } = await admin.from("billing_agreements").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (!data) return NextResponse.json({ error: "Não há assinatura nos novos provedores" }, { status: 404 })
    const agreement = data as Agreement
    if (action === "reset") {
      if (agreement.provider !== "efi" || agreement.pix_mode !== "automatic" || agreement.status !== "pending") throw new Error("Reinício indisponível para esta assinatura")
      const { data: charge } = await admin.from("billing_charges").select("*").eq("agreement_id", agreement.id).eq("kind", "immediate").order("created_at", { ascending: true }).limit(1).maybeSingle()
      if (!charge?.expires_at || new Date(charge.expires_at).getTime() > Date.now()) throw new Error("A autorização Pix ainda está válida")
      await reconcilePixCharge(charge as Charge, agreement)
      const { data: settledCharge } = await admin.from("billing_charges").select("status").eq("id", charge.id).single()
      if (settledCharge?.status === "paid") return NextResponse.json({ success: true, settled: true })
      await cancelAgreement(agreement)
    }
    else if (action === "cancel") await cancelAgreement(agreement)
    else if (action === "renew") {
      if (agreement.provider !== "efi" || agreement.pix_mode !== "manual" || agreement.status === "canceled") throw new Error("Renovação manual indisponível para esta assinatura")
      if (agreement.paid_until && new Date(agreement.paid_until).getTime() > Date.now() + 3 * 86400000) throw new Error("A renovação fica disponível três dias antes do vencimento")
      return NextResponse.json({ charge: await createPixCharge(agreement, true) })
    } else if (agreement.provider === "paypal") await reconcilePayPal(agreement)
    else {
      const { data: charges } = await admin.from("billing_charges").select("*").eq("agreement_id", agreement.id).eq("status", "pending").limit(10)
      for (const charge of (charges ?? []) as Charge[]) await reconcilePixCharge(charge, agreement)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação" }, { status: 409 })
  }
}
