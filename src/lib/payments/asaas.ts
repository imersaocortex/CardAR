import "server-only"
import { configuredAsaasKey } from "./asaas-secret"

export class AsaasError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function asaasRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const key = await configuredAsaasKey()
  if (!key || !["sandbox", "production"].includes(process.env.ASAAS_ENVIRONMENT || "")) throw new Error("Asaas não configurada")
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Caminho da Asaas inválido")
  const base = process.env.ASAAS_ENVIRONMENT === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3"
  const response = await fetch(`${base}${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { "access_token": key, "accept": "application/json", "content-type": "application/json", "User-Agent": "CortexAR/1.0" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new AsaasError(response.status, `Asaas retornou HTTP ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface AsaasAuthorization {
  id: string
  status: string
  contractId?: string
  customerId?: string
  subscriptionId?: string | null
  endToEndIdentifier?: string | null
  paymentCreationMode?: string
  frequency?: string
  value?: number
  payload?: string | null
  immediateQrCode?: { expirationDate?: string; conciliationIdentifier?: string }
}

export interface AsaasPayment {
  id: string
  customer: string
  subscription?: string | null
  pixAutomaticAuthorizationId?: string | null
  externalReference?: string | null
  billingType: string
  status: string
  value: number
  dueDate: string
  paymentDate?: string | null
  confirmedDate?: string | null
  clientPaymentDate?: string | null
  invoiceUrl?: string | null
  pixTransaction?: string | null
}
