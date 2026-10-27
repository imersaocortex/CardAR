import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { billingEnvironment, mercadoPagoEnvironment } from "@/lib/payments/settings"
import { asaasWebhookStatus, registerAsaasWebhook } from "@/lib/payments/asaas-webhooks"
import { canStoreAsaasKey, encryptAsaasKey } from "@/lib/payments/asaas-secret"

async function authorize() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single()
  return data?.role === "super_admin" ? user : null
}
async function settings() {
  const { data, error } = await createAdminClient().from("billing_provider_settings")
    .select("asaas_enabled, asaas_pix_key, asaas_api_key_ciphertext, mercado_pago_enabled, updated_at").eq("id", 1).single()
  if (error || !data) throw new Error("Aplique a migração 028 antes de configurar os pagamentos")
  return data
}
export async function GET() {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  try {
    const row = await settings()
    return NextResponse.json({ settings: { asaas_enabled: row.asaas_enabled, asaas_pix_key: row.asaas_pix_key,
      has_api_key: !!row.asaas_api_key_ciphertext || !!process.env.ASAAS_API_KEY,
      mercado_pago_enabled: row.mercado_pago_enabled }, environment: billingEnvironment(!!row.asaas_api_key_ciphertext),
      mercadoPagoEnvironment: mercadoPagoEnvironment(), canStoreKey: canStoreAsaasKey() })
  }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}
export async function PATCH(request: Request) {
  const user = await authorize()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = z.union([
    z.object({ enabled: z.boolean() }),
    z.object({ mercado_pago_enabled: z.boolean() }),
    z.object({ pix_key: z.string().trim().max(255) }),
  ]).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Opção inválida" }, { status: 400 })
  try {
    const row = await settings()
    if ("mercado_pago_enabled" in parsed.data && parsed.data.mercado_pago_enabled) {
      const missing = mercadoPagoEnvironment().missing
      if (missing.length) return NextResponse.json({ error: `Faltam configurações: ${missing.join(", ")}` }, { status: 409 })
    }
    if ("enabled" in parsed.data && parsed.data.enabled) {
      const missing = billingEnvironment(!!row.asaas_api_key_ciphertext).missing
      if (missing.length) return NextResponse.json({ error: `Faltam configurações: ${missing.join(", ")}` }, { status: 409 })
      const webhook = await asaasWebhookStatus()
      if (!webhook.configured) return NextResponse.json({ error: "Configure o webhook da Asaas antes de ativar novas contratações" }, { status: 409 })
    }
    const values = "enabled" in parsed.data
      ? { asaas_enabled: parsed.data.enabled }
      : "mercado_pago_enabled" in parsed.data ? { mercado_pago_enabled: parsed.data.mercado_pago_enabled }
      : { asaas_pix_key: parsed.data.pix_key || null }
    const { data, error } = await createAdminClient().from("billing_provider_settings")
      .update({ ...values, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("id", 1).select("asaas_enabled, asaas_pix_key, asaas_api_key_ciphertext, mercado_pago_enabled, updated_at").single()
    if (error || !data) throw new Error("Não foi possível salvar")
    return NextResponse.json({ settings: { asaas_enabled: data.asaas_enabled, asaas_pix_key: data.asaas_pix_key,
      has_api_key: !!data.asaas_api_key_ciphertext || !!process.env.ASAAS_API_KEY,
      mercado_pago_enabled: data.mercado_pago_enabled } })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}
export async function PUT(request: Request) {
  const user = await authorize()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = z.object({ api_key: z.string().trim().min(20).max(1000) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Chave de API inválida" }, { status: 400 })
  try {
    await settings()
    const encrypted = encryptAsaasKey(parsed.data.api_key)
    const { error } = await createAdminClient().from("billing_provider_settings")
      .update({ asaas_api_key_ciphertext: encrypted, updated_at: new Date().toISOString(), updated_by: user.id }).eq("id", 1)
    if (error) throw new Error("Não foi possível salvar a chave")
    return NextResponse.json({ saved: true })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}
export async function POST(request: Request) {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = z.object({ action: z.enum(["verify_webhook", "register_webhook"]) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  try {
    await settings()
    const status = parsed.data.action === "register_webhook" ? await registerAsaasWebhook() : await asaasWebhookStatus()
    return NextResponse.json({ webhook: status })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}
