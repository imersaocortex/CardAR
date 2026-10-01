import "server-only"

function credentials() {
  const client = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!client || !secret) throw new Error("PayPal não configurado")
  const production = process.env.PAYPAL_ENVIRONMENT === "production"
  if (production && process.env.BILLING_LIVE_ENABLED !== "true") throw new Error("Cobranças reais ainda não foram habilitadas")
  return { base: production ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com", authorization: Buffer.from(`${client}:${secret}`).toString("base64") }
}

export async function paypalRequest<T>(path: string, method = "GET", body?: unknown, requestId?: string): Promise<T> {
  const { base, authorization } = credentials()
  const auth = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(15000),
  })
  if (!auth.ok) throw new Error("Falha na autenticação do PayPal")
  const token = await auth.json() as { access_token: string }
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`PayPal não concluiu a operação (${response.status})`)
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export interface PayPalSubscription {
  id: string; status: string; custom_id?: string; plan_id: string
  links?: { rel: string; href: string }[]
  billing_info?: { next_billing_time?: string; last_payment?: { time: string; amount: { value: string; currency_code: string } } }
}

export async function verifyPayPalWebhook(headers: Headers, event: unknown) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return false
  const result = await paypalRequest<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", "POST", {
    auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"), webhook_id: webhookId, webhook_event: event,
  })
  return result.verification_status === "SUCCESS"
}
