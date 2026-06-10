let currentApiKey = process.env.ASAAS_API_KEY
let currentApiUrl = process.env.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3"

export function configureAsaas(apiKey: string, apiUrl?: string) {
  currentApiKey = apiKey
  if (apiUrl) currentApiUrl = apiUrl
}

interface AsaasCustomer {
  id: string
  name: string
  email: string
  cpfCnpj?: string
  phone?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
  city?: string
  state?: string
  postalCode?: string
}

interface AsaasCheckout {
  id: string
  link: string | null
  url?: string
  status?: string
  subscription?: string
}

interface AsaasSubscription {
  id: string
  customer: string
  billingType: string
  value: number
  nextDueDate: string
  status: string
}

interface AsaasPayment {
  id: string
  subscription: string | null
  status: string
  value: number
  dueDate: string
  paidDate: string | null
  invoiceUrl: string | null
}

async function asaasFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!currentApiKey) {
    throw new Error("ASAAS_API_KEY não configurada")
  }

  const url = `${currentApiUrl}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "access_token": currentApiKey,
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`ASAAS error ${res.status}: ${body}`)
  }

  return res.json()
}

export async function createCustomer(
  organizationId: string,
  name: string,
  email: string,
  cpfCnpj?: string,
  phone?: string,
  address?: string,
  addressNumber?: string,
  complement?: string,
  neighborhood?: string,
  city?: string,
  state?: string,
  zipcode?: string,
): Promise<string> {
  const body: Record<string, any> = { name, email }
  if (cpfCnpj) body.cpfCnpj = cpfCnpj.replace(/\D/g, "")
  if (phone) body.phone = phone.replace(/\D/g, "")
  if (address) body.address = address
  if (addressNumber) body.addressNumber = addressNumber
  if (complement) body.complement = complement
  if (neighborhood) body.province = neighborhood
  if (city) body.city = city
  if (state) body.state = state
  if (zipcode) body.postalCode = zipcode.replace(/\D/g, "")

  const customer = await asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(body),
  })
  return customer.id
}

export async function updateCustomer(customerId: string, data: Partial<AsaasCustomer>): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>(`/customers/${customerId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function getCustomer(customerId: string): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>(`/customers/${customerId}`)
}

export async function createSubscription(
  customerId: string,
  value: number,
  billingType: string = "PIX",
  description?: string,
  cycle: string = "MONTHLY",
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value,
      nextDueDate: getNextDueDate(),
      cycle,
      description: description || "AR Business Studio",
    }),
  })
}

export async function createCheckout(
  customerId: string,
  billingType: string,
  value: number,
  dueDate: string,
  cycle: string,
  planName: string,
  callbackUrl: string,
): Promise<AsaasCheckout> {
  const checkout = await asaasFetch<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: [billingType],
      chargeTypes: ["RECURRENT"],
      items: [{
        name: planName,
        value,
        quantity: 1,
      }],
      callback: {
        successUrl: `${callbackUrl}/billing?checkout_success=true`,
        cancelUrl: `${callbackUrl}/billing`,
        expiredUrl: `${callbackUrl}/billing`,
        autoRedirect: true,
      },
      subscription: {
        cycle,
        nextDueDate: dueDate,
        description: planName,
      },
      customer: customerId,
    }),
  })
  checkout.url = checkout.link || undefined
  return checkout
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  try {
    await asaasFetch(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    })
  } catch {
    // Some ASAAS versions use POST /subscriptions/{id}/cancel
    await asaasFetch(`/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
    })
  }
}

export async function getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${subscriptionId}`)
}

export async function getPayments(subscriptionId?: string): Promise<AsaasPayment[]> {
  let path = "/payments"
  if (subscriptionId) {
    path += `?subscription=${subscriptionId}`
  }
  const result = await asaasFetch<{ data: AsaasPayment[] }>(path)
  return result.data || []
}

export async function getPaymentsByCustomer(customerId: string): Promise<AsaasPayment[]> {
  const result = await asaasFetch<{ data: AsaasPayment[] }>(`/payments?customer=${customerId}&limit=10`)
  return result.data || []
}

export async function getPayment(paymentId: string): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${paymentId}`)
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.ASAAS_WEBHOOK_SECRET
  if (!secret) return false

  const crypto = require("crypto")
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex")

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export function getNextDueDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split("T")[0]
}

export async function ensureAsaasKey(admin: any) {
  if (process.env.ASAAS_API_KEY) return
  const { data: settings } = await admin
    .from("system_settings")
    .select("asaas")
    .eq("id", 1)
    .maybeSingle()
  const config = settings?.asaas as Record<string, any> | undefined
  const env = config?.environment || "debug"
  const apiKey = config?.[`${env}_api_key`] as string | undefined
  const apiUrl = env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3"
  if (apiKey) {
    process.env.ASAAS_API_KEY = apiKey
    configureAsaas(apiKey, apiUrl)
  }
}

export async function loadWebhookSecret(admin: any) {
  if (process.env.ASAAS_WEBHOOK_SECRET) return
  const { data: settings } = await admin
    .from("system_settings")
    .select("asaas")
    .eq("id", 1)
    .maybeSingle()
  const config = settings?.asaas as Record<string, any> | undefined
  const env = config?.environment || "debug"
  const secret = config?.[`${env}_webhook_secret`] as string | undefined
  if (secret) {
    process.env.ASAAS_WEBHOOK_SECRET = secret
  }
}
