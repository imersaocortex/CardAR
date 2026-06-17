import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const admin = createAdminClient()

  const { data: settings } = await admin
    .from("system_settings")
    .select("asaas, stripe")
    .eq("id", 1)
    .maybeSingle()

  const asaasConfig = settings?.asaas as Record<string, any> | undefined
  const stripeConfig = settings?.stripe as Record<string, any> | undefined

  const asaasEnv = asaasConfig?.environment || "debug"
  const stripeEnv = stripeConfig?.environment || "debug"

  const asaasConfigured = !!(process.env.ASAAS_API_KEY || asaasConfig?.[`${asaasEnv}_api_key`])
  const stripeConfigured = !!(process.env.STRIPE_SECRET_KEY || stripeConfig?.[`${stripeEnv}_secret_key`])

  return NextResponse.json({
    asaas: { configured: asaasConfigured },
    stripe: { configured: stripeConfigured },
  })
}
