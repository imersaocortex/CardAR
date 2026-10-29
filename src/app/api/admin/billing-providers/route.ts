import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { mercadoPagoEnvironment, syncPayEnvironment } from "@/lib/payments/settings"
import { recoverSyncPayAgreement, verifySyncPayPlanLink } from "@/lib/payments/syncpay"

async function authorize() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single()
  return data?.role === "super_admin" ? user : null
}
async function settings() {
  const { data, error } = await createAdminClient().from("billing_provider_settings")
    .select("syncpay_pix_enabled, syncpay_card_enabled, mercado_pago_enabled").eq("id", 1).single()
  if (error || !data) throw new Error("Aplique a migração 032 antes de configurar a Sync Pay")
  return data
}
export async function GET() {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  try {
    const admin = createAdminClient()
    const [row, plans, links, pending, events] = await Promise.all([
      settings(), admin.from("plans").select("id, name, price, billing_cycle").eq("active", true).gt("price", 0).order("price"),
      admin.from("syncpay_plan_links").select("plan_id, method, external_token"),
      admin.from("billing_agreements").select("id, plan_id, created_at").eq("provider", "syncpay").is("external_id", null).eq("setup_stage", "enrolling").limit(30),
      admin.from("syncpay_events").select("id, event, last_error, created_at").is("processed_at", null).order("created_at").limit(30),
    ])
    if ([plans, links, pending, events].some(result => result.error)) throw new Error("Não foi possível consultar a configuração Sync Pay")
    return NextResponse.json({ settings: row, plans: plans.data, links: links.data, pending: pending.data, events: events.data,
      syncPayEnvironment: syncPayEnvironment(), syncPayCardEnvironment: syncPayEnvironment(true), mercadoPagoEnvironment: mercadoPagoEnvironment() })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}
export async function PATCH(request: Request) {
  const user = await authorize()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = z.object({ module: z.enum(["syncpay_pix_enabled", "syncpay_card_enabled", "mercado_pago_enabled"]), enabled: z.boolean() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Módulo inválido" }, { status: 400 })
  try {
    await settings()
    if (parsed.data.enabled) {
      const missing = parsed.data.module === "mercado_pago_enabled" ? mercadoPagoEnvironment().missing : syncPayEnvironment(parsed.data.module === "syncpay_card_enabled").missing
      if (missing.length) return NextResponse.json({ error: `Faltam configurações: ${missing.join(", ")}` }, { status: 409 })
      if (parsed.data.module !== "mercado_pago_enabled") {
        const { data: links, error } = await createAdminClient().from("syncpay_plan_links").select("plan_id, external_token")
          .eq("method", parsed.data.module === "syncpay_card_enabled" ? "credit_card" : "pix_automatico")
        if (error || !links?.length) throw new Error("Vincule pelo menos um plano à modalidade antes de ativar")
        for (const link of links) await verifySyncPayPlanLink(link.plan_id, parsed.data.module === "syncpay_card_enabled" ? "credit_card" : "pix_automatico", link.external_token)
      }
    }
    const { error } = await createAdminClient().from("billing_provider_settings").update({
      [parsed.data.module]: parsed.data.enabled, asaas_enabled: false, updated_at: new Date().toISOString(), updated_by: user.id,
    }).eq("id", 1)
    if (error) throw new Error("Não foi possível salvar os módulos")
    return NextResponse.json({ saved: true })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }) }
}
export async function PUT(request: Request) {
  const user = await authorize()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = z.object({ plan_id: z.string().uuid(), method: z.enum(["pix_automatico", "credit_card"]), external_token: z.union([z.string().uuid(), z.literal("")]) }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Vínculo inválido" }, { status: 400 })
  try {
    await settings()
    const admin = createAdminClient()
    if (parsed.data.external_token) {
      await verifySyncPayPlanLink(parsed.data.plan_id, parsed.data.method, parsed.data.external_token)
      const { error } = await admin.from("syncpay_plan_links").upsert({ ...parsed.data, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "plan_id,method" })
      if (error) throw new Error("Não foi possível vincular; o token pode já pertencer a outro plano")
    } else {
      const { error } = await admin.from("syncpay_plan_links").delete().eq("plan_id", parsed.data.plan_id).eq("method", parsed.data.method)
      if (error) throw new Error("Não foi possível remover o vínculo")
    }
    return NextResponse.json({ saved: true })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }) }
}
export async function POST(request: Request) {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = z.object({ action: z.literal("recover"), agreement_id: z.string().uuid(), subscription_token: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  try {
    await recoverSyncPayAgreement(parsed.data.agreement_id, parsed.data.subscription_token)
    return NextResponse.json({ saved: true })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }) }
}
