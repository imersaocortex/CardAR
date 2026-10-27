import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { canStoreAsaasKey } from "./asaas-secret"

export function billingEnvironment(hasStoredKey = false) {
  const production = process.env.ASAAS_ENVIRONMENT === "production"
  const missing = ["ASAAS_ENVIRONMENT", "ASAAS_WEBHOOK_TOKEN", "ASAAS_WEBHOOK_EMAIL", "APP_URL", "CRON_SECRET"]
    .filter((key) => !process.env[key])
  if (!hasStoredKey && !process.env.ASAAS_API_KEY) missing.push("Chave de API da Asaas")
  if (hasStoredKey && !canStoreAsaasKey()) missing.push("ASAAS_SECRETS_KEY")
  if (process.env.ASAAS_ENVIRONMENT && !["production", "sandbox"].includes(process.env.ASAAS_ENVIRONMENT)) missing.push("ASAAS_ENVIRONMENT=production|sandbox")
  if (process.env.ASAAS_WEBHOOK_TOKEN && (process.env.ASAAS_WEBHOOK_TOKEN.length < 32 || /\s/.test(process.env.ASAAS_WEBHOOK_TOKEN))) missing.push("ASAAS_WEBHOOK_TOKEN com 32+ caracteres sem espaços")
  if (process.env.APP_URL) {
    try { if (new URL(process.env.APP_URL).protocol !== "https:") missing.push("APP_URL HTTPS") }
    catch { missing.push("APP_URL válido") }
  }
  if (!production && process.env.BILLING_SANDBOX_DB_ISOLATED !== "true") missing.push("BILLING_SANDBOX_DB_ISOLATED=true")
  if (production && process.env.BILLING_LIVE_ENABLED !== "true") missing.push("BILLING_LIVE_ENABLED=true")
  if (process.env.BILLING_V2_ENABLED !== "true") missing.push("BILLING_V2_ENABLED=true")
  return { production, missing, liveEnabled: process.env.BILLING_LIVE_ENABLED === "true" }
}

export async function billingAvailability() {
  const { data, error } = await createAdminClient().from("billing_provider_settings")
    .select("asaas_enabled, asaas_api_key_ciphertext, mercado_pago_enabled").eq("id", 1).maybeSingle()
  if (error || !data) throw new Error("Aplique a migração 028 para configurar os pagamentos")
  const environment = billingEnvironment(!!data.asaas_api_key_ciphertext)
  const mercadoPago = mercadoPagoEnvironment()
  return {
    asaas: { enabled: data.asaas_enabled, configured: data.asaas_enabled && environment.missing.length === 0 },
    mercado_pago: { enabled: data.mercado_pago_enabled, configured: data.mercado_pago_enabled && mercadoPago.missing.length === 0 },
  }
}

export function mercadoPagoEnvironment() {
  const production = process.env.MERCADO_PAGO_ENVIRONMENT === "production"
  const missing = ["MERCADO_PAGO_ENVIRONMENT", "MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_WEBHOOK_SECRET", "APP_URL", "CRON_SECRET"]
    .filter((key) => !process.env[key])
  if (process.env.MERCADO_PAGO_ENVIRONMENT && !["production", "sandbox"].includes(process.env.MERCADO_PAGO_ENVIRONMENT)) missing.push("MERCADO_PAGO_ENVIRONMENT=production|sandbox")
  if (process.env.MERCADO_PAGO_WEBHOOK_SECRET && process.env.MERCADO_PAGO_WEBHOOK_SECRET.length < 32) missing.push("MERCADO_PAGO_WEBHOOK_SECRET com 32+ caracteres")
  if (process.env.APP_URL) {
    try { if (new URL(process.env.APP_URL).protocol !== "https:") missing.push("APP_URL HTTPS") }
    catch { missing.push("APP_URL válido") }
  }
  if (!production && process.env.BILLING_SANDBOX_DB_ISOLATED !== "true") missing.push("BILLING_SANDBOX_DB_ISOLATED=true")
  if (production && process.env.BILLING_LIVE_ENABLED !== "true") missing.push("BILLING_LIVE_ENABLED=true")
  if (process.env.BILLING_V2_ENABLED !== "true") missing.push("BILLING_V2_ENABLED=true")
  return { production, missing }
}
