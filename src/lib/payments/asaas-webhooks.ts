import "server-only"
import { asaasRequest } from "./asaas"

const EVENTS = [
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED", "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
]
interface Webhook { id: string; url: string; enabled: boolean; interrupted: boolean; events: string[] }
function endpoint() {
  const url = new URL(process.env.APP_URL || "")
  if (url.protocol !== "https:") throw new Error("APP_URL precisa usar HTTPS")
  return `${url.origin}/api/webhooks/asaas`
}
async function list() {
  const result = await asaasRequest<{ data: Webhook[]; hasMore?: boolean }>("/webhooks?limit=100")
  return result.data || []
}
export async function asaasWebhookStatus() {
  const expected = endpoint()
  const matching = (await list()).filter((item) => item.url === expected)
  if (matching.length > 1) throw new Error("Há webhooks duplicados para este endereço na Asaas")
  const webhook = matching[0]
  const events = Array.isArray(webhook?.events) ? webhook.events : []
  return { configured: !!webhook && webhook.enabled && !webhook.interrupted && EVENTS.every((event) => events.includes(event)),
    enabled: !!webhook?.enabled, interrupted: !!webhook?.interrupted, missingEvents: EVENTS.filter((event) => !events.includes(event)) }
}
export async function registerAsaasWebhook() {
  const url = endpoint()
  const token = process.env.ASAAS_WEBHOOK_TOKEN
  const email = process.env.ASAAS_WEBHOOK_EMAIL
  if (!token || token.length < 32 || /\s/.test(token) || !email) throw new Error("Token e e-mail do webhook Asaas não configurados")
  const matching = (await list()).filter((item) => item.url === url)
  if (matching.length > 1) throw new Error("Há webhooks duplicados para este endereço na Asaas")
  if (matching[0]) {
    await asaasRequest(`/webhooks/${encodeURIComponent(matching[0].id)}`, "PUT", {
      authToken: token, enabled: true, interrupted: false, events: EVENTS, sendType: "SEQUENTIALLY",
    })
  } else {
    await asaasRequest("/webhooks", "POST", {
      name: "CortexAR Pix Automático", url, email, enabled: true, interrupted: false,
      authToken: token, events: EVENTS, sendType: "SEQUENTIALLY", apiVersion: 3,
    })
  }
  return asaasWebhookStatus()
}
