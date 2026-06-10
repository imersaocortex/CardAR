let currentApiKey = process.env.ASAAS_API_KEY
let currentApiUrl = process.env.ASAAS_API_URL || "https://sandbox.asaas.com/api/v3"

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
  url: string
  subscription: string
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
  subscriptionId: string,
  customerId: string,
  billingType: string = "PIX",
  value: number,
  dueDate: string,
  cycle: string = "MONTHLY",
): Promise<AsaasCheckout> {
  return asaasFetch<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscriptionId,
      customer: customerId,
      billingTypes: [billingType],
      value,
      dueDateLimitDays: 5,
      maxInstallmentCount: 1,
    }),
  })
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await asaasFetch(`/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  })
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

function getNextDueDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split("T")[0]
}
