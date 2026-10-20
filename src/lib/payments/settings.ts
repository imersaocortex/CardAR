import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type BillingProvider = "efi" | "paypal"

export function billingEnvironment() {
  const globalEnabled = process.env.BILLING_V2_ENABLED === "true"
  const liveEnabled = process.env.BILLING_LIVE_ENABLED === "true"
  const pixMode = process.env.EFI_PIX_MODE === "manual" ? "manual" as const : "automatic" as const
  const efiProduction = process.env.EFI_ENVIRONMENT === "production"
  const paypalProduction = process.env.PAYPAL_ENVIRONMENT === "production"
  const efiMissing = [
    "EFI_ENVIRONMENT", "EFI_CLIENT_ID", "EFI_CLIENT_SECRET", "EFI_CERTIFICATE_BASE64",
    "EFI_PIX_KEY", "EFI_WEBHOOK_TOKEN", "EFI_ACCOUNT_NUMBER", "APP_URL", "CRON_SECRET",
  ].filter((key) => !process.env[key])
  const paypalMissing = [
    "PAYPAL_ENVIRONMENT", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "APP_URL", "CRON_SECRET",
  ].filter((key) => !process.env[key])
  if (process.env.EFI_ENVIRONMENT && !["production", "sandbox"].includes(process.env.EFI_ENVIRONMENT)) efiMissing.push("EFI_ENVIRONMENT=production|sandbox")
  if (process.env.PAYPAL_ENVIRONMENT && !["production", "sandbox"].includes(process.env.PAYPAL_ENVIRONMENT)) paypalMissing.push("PAYPAL_ENVIRONMENT=production|sandbox")
  const appUrl = process.env.APP_URL
  if (appUrl) {
    try { if (new URL(appUrl).protocol !== "https:") { efiMissing.push("APP_URL HTTPS"); paypalMissing.push("APP_URL HTTPS") } }
    catch { efiMissing.push("APP_URL válido"); paypalMissing.push("APP_URL válido") }
  }
  if (pixMode !== "automatic") efiMissing.push("EFI_PIX_MODE=automatic")
  if (!efiProduction && process.env.BILLING_SANDBOX_DB_ISOLATED !== "true") efiMissing.push("BILLING_SANDBOX_DB_ISOLATED=true")
  if (!paypalProduction && process.env.BILLING_SANDBOX_DB_ISOLATED !== "true") paypalMissing.push("BILLING_SANDBOX_DB_ISOLATED=true")
  if (process.env.EFI_WEBHOOK_TOKEN && !/^[A-Za-z0-9_-]{24,}$/.test(process.env.EFI_WEBHOOK_TOKEN)) efiMissing.push("EFI_WEBHOOK_TOKEN URL-safe com 24+ caracteres")
  if (efiProduction && !liveEnabled) efiMissing.push("BILLING_LIVE_ENABLED=true")
  if (paypalProduction && !liveEnabled) paypalMissing.push("BILLING_LIVE_ENABLED=true")
  if (!globalEnabled) { efiMissing.push("BILLING_V2_ENABLED=true"); paypalMissing.push("BILLING_V2_ENABLED=true") }
  return { globalEnabled, liveEnabled, pixMode, efiProduction, paypalProduction, efiMissing, paypalMissing }
}

export async function billingAvailability() {
  const env = billingEnvironment()
  const { data, error } = await createAdminClient().from("billing_provider_settings")
    .select("efi_enabled, paypal_enabled").eq("id", 1).maybeSingle()
  if (error || !data) throw new Error("Configuração dos meios de pagamento indisponível")
  return {
    paypal: { enabled: data.paypal_enabled, configured: data.paypal_enabled && env.paypalMissing.length === 0 },
    efi: { enabled: data.efi_enabled, configured: data.efi_enabled && env.efiMissing.length === 0 },
    pixMode: env.pixMode,
  }
}
