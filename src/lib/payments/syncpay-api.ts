import "server-only"

// Share token requests within each server instance; never retry a financial POST.
let cached: { token: string; expires: number } | null = null
let obtaining: Promise<string> | null = null
export class SyncPayApiError extends Error {
  constructor(public status: number) { super(`Sync Pay retornou HTTP ${status}. Confira credenciais, permissões e dados do perfil.`) }
}
async function accessToken() {
  if (cached && cached.expires > Date.now()) return cached.token
  if (obtaining) return obtaining
  obtaining = (async () => {
    if (!process.env.SYNC_PAY_CLIENT_ID || !process.env.SYNC_PAY_CLIENT_SECRET) throw new Error("Credenciais Sync Pay não configuradas")
    const response = await fetch("https://api.syncpayments.com.br/api/partner/v1/auth-token", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: process.env.SYNC_PAY_CLIENT_ID, client_secret: process.env.SYNC_PAY_CLIENT_SECRET }),
    })
    if (!response.ok) throw new Error(`Autenticação Sync Pay retornou HTTP ${response.status}`)
    const data = await response.json()
    if (typeof data.access_token !== "string" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Token Sync Pay inválido")
    cached = { token: data.access_token, expires: Date.now() + Math.min(data.expires_in, 3600) * 1000 - 10000 }
    return cached.token
  })()
  try { return await obtaining } finally { obtaining = null }
}
export async function syncPayRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = await accessToken()
  const response = await fetch(`https://api.syncpayments.com.br/api/partner/v1${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (response.status === 401) cached = null
  if (!response.ok) throw new SyncPayApiError(response.status)
  return response.json() as Promise<T>
}
