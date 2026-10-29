import { createHash, createHmac, timingSafeEqual } from "node:crypto"

export type SyncPayMethod = "pix_automatico" | "credit_card"
export interface SyncPayPlan { token: string; amount: string | number; periodicity_days: number; billing_method: string; status: string }
export interface SyncPayCharge { cycle_number: number; amount: string | number; status: string; due_date: string; paid_at?: string | null; expires_at?: string | null; payment?: { pix_code?: string | null } }
export interface SyncPaySubscription {
  token: string; status: string; subscriber_email: string; subscriber_document: string
  started_at: string | null; plan: SyncPayPlan; charges: SyncPayCharge[] | null
}
export const syncPayUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function syncPayWebhookSecrets(single: string | undefined, list: string | undefined): string[] {
  try {
    const values: unknown = list ? JSON.parse(list) : single ? [single] : []
    if (!Array.isArray(values) || !values.length || values.length > 30 || values.some(value => typeof value !== "string" || value.length < 32 || /\s/.test(value))) return []
    return values
  } catch { return [] }
}
export function syncPayIdentity(email: string, document: string) {
  return createHash("sha256").update(`${email.trim().toLowerCase()}|${document.replace(/\D/g, "")}`).digest("hex")
}
function cents(value: string | number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(Math.round(number * 100)) || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) throw new Error("Valor Sync Pay inválido")
  return Math.round(number * 100)
}
export function validateSyncPayPlan(plan: SyncPayPlan, expected: { token: string; amount_cents: number; method: SyncPayMethod; days: number }, requireActive = true) {
  if (plan.token !== expected.token || cents(plan.amount) !== expected.amount_cents || plan.billing_method !== expected.method ||
      plan.periodicity_days !== expected.days || (requireActive && plan.status !== "active")) throw new Error("Plano Sync Pay divergente: confira valor, modalidade e periodicidade (30 ou 365 dias)")
}
export function validateSyncPaySubscription(remote: SyncPaySubscription, expected: { token: string; plan_token: string; amount_cents: number; method: SyncPayMethod; days: number; identity: string }) {
  if (remote.token !== expected.token || !remote.subscriber_email || !remote.subscriber_document ||
      syncPayIdentity(remote.subscriber_email, remote.subscriber_document) !== expected.identity || (remote.charges !== null && !Array.isArray(remote.charges))) throw new Error("Assinatura Sync Pay divergente")
  validateSyncPayPlan(remote.plan, { token: expected.plan_token, amount_cents: expected.amount_cents, method: expected.method, days: expected.days }, false)
}
export function syncPayChargeSettlement(charge: SyncPayCharge, startedAt: string | null, days: number, amount: number, now = Date.now()) {
  if (!Number.isSafeInteger(charge.cycle_number) || charge.cycle_number < 1 || cents(charge.amount) !== amount || !/^\d{4}-\d{2}-\d{2}$/.test(charge.due_date)) throw new Error("Cobrança Sync Pay divergente")
  if (charge.status !== "paid") return null
  const paid = Date.parse(charge.paid_at || "")
  const start = Date.parse(startedAt || "")
  const end = start + charge.cycle_number * days * 86400000
  if (!Number.isFinite(paid) || !Number.isFinite(end) || paid > now + 600000 || end <= paid) throw new Error("Período Sync Pay inválido; revisão administrativa necessária")
  return { paidAt: new Date(paid).toISOString(), periodEnd: new Date(end).toISOString() }
}
export function verifySyncPayWebhook(secret: string, authorization: string | null, signature: string | null, raw: string, now = Date.now()) {
  if (!secret || secret.length < 32) return false
  if (signature) {
    const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature)
    if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false
    const expected = createHmac("sha256", secret).update(`${match[1]}.${raw}`).digest()
    return timingSafeEqual(expected, Buffer.from(match[2], "hex"))
  }
  const actual = Buffer.from(authorization || "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
