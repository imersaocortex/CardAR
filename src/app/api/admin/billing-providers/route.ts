import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { billingEnvironment, type BillingProvider } from "@/lib/payments/settings"
import { efiWebhookStatus, registerEfiWebhooks } from "@/lib/payments/efi-webhooks"

async function authorize() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single()
  return !error && data?.role === "super_admin" ? user : null
}

async function settings() {
  const { data, error } = await createAdminClient().from("billing_provider_settings")
    .select("efi_enabled, paypal_enabled, updated_at").eq("id", 1).single()
  if (error || !data) throw new Error("Aplique a migração 027 antes de alterar os meios de pagamento")
  return data
}

export async function GET() {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  try { return NextResponse.json({ settings: await settings(), environment: billingEnvironment() }) }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}

const changeSchema = z.object({ provider: z.enum(["efi", "paypal"]), enabled: z.boolean() })
export async function PATCH(request: Request) {
  const user = await authorize()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = changeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Opção inválida" }, { status: 400 })
  const { provider, enabled } = parsed.data
  try {
    await settings()
    if (enabled) {
      const env = billingEnvironment()
      const missing = provider === "efi" ? env.efiMissing : env.paypalMissing
      if (missing.length) return NextResponse.json({ error: `Faltam configurações: ${missing.join(", ")}` }, { status: 409 })
      if (provider === "efi") {
        const webhooks = await efiWebhookStatus()
        if (!Object.values(webhooks).every(Boolean)) return NextResponse.json({ error: "Configure e verifique os três webhooks da Efí antes de ativar" }, { status: 409 })
      }
    }
    const column = `${provider}_enabled` as `${BillingProvider}_enabled`
    const { data, error } = await createAdminClient().from("billing_provider_settings")
      .update({ [column]: enabled, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("id", 1).select("efi_enabled, paypal_enabled, updated_at").single()
    if (error || !data) throw new Error("Não foi possível salvar a configuração")
    return NextResponse.json({ settings: data })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}

const actionSchema = z.object({ action: z.enum(["verify_webhooks", "register_webhooks"]) })
export async function POST(request: Request) {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  try {
    await settings()
    const env = billingEnvironment()
    if (env.efiMissing.length) return NextResponse.json({ error: `Faltam configurações: ${env.efiMissing.join(", ")}` }, { status: 409 })
    const webhooks = parsed.data.action === "register_webhooks" ? await registerEfiWebhooks() : await efiWebhookStatus()
    return NextResponse.json({ webhooks })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }) }
}
