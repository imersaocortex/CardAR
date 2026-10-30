import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { syncPayIdentity, syncPayPhone, validateSyncPayPlan, validateSyncPaySubscription, syncPayChargeSettlement, verifySyncPayWebhook } from "../src/lib/payments/syncpay-rules.ts"

const expected = { token: "plan-1", amount_cents: 2990, method: "pix_automatico", days: 30 }
const plan = { token: "plan-1", amount: "29.90", billing_method: "pix_automatico", periodicity_days: 30, status: "active" }

test("Sync Pay receives national digits, stripping country prefixes without corrupting DDD 55", () => {
  for (const [input, expectedPhone] of [
    ["+55 (81) 99999-1234", "81999991234"], ["5581999991234", "81999991234"],
    ["0055 (81) 99999-1234", "81999991234"], ["(81) 99999-1234", "81999991234"],
    ["+55 (81) 3333-1234", "8133331234"], ["(81) 3333-1234", "8133331234"],
    ["(55) 99999-1234", "55999991234"], ["(55) 3333-1234", "5533331234"],
    ["+55 (55) 99999-1234", "55999991234"], ["0055 (55) 99999-1234", "55999991234"],
    [undefined, ""], [null, ""], ["  ", ""],
  ]) assert.equal(syncPayPhone(input), expectedPhone, String(input))
})

test("Sync Pay rejects malformed or foreign international numbers before enrollment", () => {
  for (const input of ["999991234", "+55 99999-1234", "+1 (212) 555-1234", "+44 20 7946 0958", "0055 99999-1234", "551234567890123", "telefone inválido"])
    assert.throws(() => syncPayPhone(input), /DDD/, input)
})
test("Sync Pay rejects a mismatched amount, modality, interval or plan before enrollment", () => {
  assert.doesNotThrow(() => validateSyncPayPlan(plan, expected))
  for (const change of [{ amount: "2.99" }, { amount: "29.901" }, { token: "other" }, { billing_method: "qr_code" }, { periodicity_days: 365 }, { status: "inactive" }])
    assert.throws(() => validateSyncPayPlan({ ...plan, ...change }, expected))
  assert.doesNotThrow(() => validateSyncPayPlan({ ...plan, billing_method: "credit_card" }, { ...expected, method: "credit_card" }))
})
test("Sync Pay verifies the subscriber and remote subscription rather than trusting webhook identity", () => {
  const remote = { token: "subscription-1", subscriber_email: "buyer@example.com", subscriber_document: "123.456.789-00", plan, charges: [] }
  const check = { token: remote.token, plan_token: plan.token, amount_cents: 2990, method: "pix_automatico", days: 30, identity: syncPayIdentity("BUYER@example.com", "12345678900") }
  assert.doesNotThrow(() => validateSyncPaySubscription(remote, check))
  assert.throws(() => validateSyncPaySubscription({ ...remote, subscriber_document: "99999999999" }, check))
  assert.throws(() => validateSyncPaySubscription({ ...remote, token: "other" }, check))
})

test("multi-method plans accept the chosen method instead of requiring it to be the default", () => {
  const multi = { ...plan, billing_methods: ["pix_automatico", "credit_card"] }
  assert.doesNotThrow(() => validateSyncPayPlan(multi, { ...expected, method: "credit_card" }))
  assert.doesNotThrow(() => validateSyncPayPlan({ ...multi, billing_method: null }, { ...expected, method: "credit_card" }))
  assert.throws(() => validateSyncPayPlan({ ...multi, billing_methods: [] }, expected))
  assert.throws(() => validateSyncPayPlan({ ...multi, billing_methods: ["qr_code"] }, expected))
})

test("settlement verifies the subscription's actual method even when the plan default changes", () => {
  const remote = { token: "subscription-1", subscriber_email: "buyer@example.com", subscriber_document: "12345678900", billing_method: "credit_card",
    plan: { ...plan, billing_methods: ["pix_automatico"], status: "inactive" }, charges: [] }
  const check = { token: remote.token, plan_token: plan.token, amount_cents: 2990, method: "credit_card", days: 30, identity: syncPayIdentity(remote.subscriber_email, remote.subscriber_document) }
  assert.doesNotThrow(() => validateSyncPaySubscription(remote, check))
  assert.throws(() => validateSyncPaySubscription({ ...remote, billing_method: "pix_automatico" }, check))
  assert.throws(() => validateSyncPaySubscription({ ...remote, plan: { ...remote.plan, amount: "1.00" } }, check))
})
test("only a paid cycle grants a fixed period, without extending it on repeated reconciliation", () => {
  const charge = { cycle_number: 2, amount: "29.90", status: "paid", due_date: "2026-10-01", paid_at: "2026-10-01T10:05:00Z" }
  const now = Date.parse("2026-10-02T00:00:00Z")
  const settled = syncPayChargeSettlement(charge, "2026-09-01T10:00:00Z", 30, 2990, now)
  assert.equal(settled.periodEnd, "2026-10-31T10:00:00.000Z")
  assert.deepEqual(syncPayChargeSettlement(charge, "2026-09-01T10:00:00Z", 30, 2990, now), settled)
  for (const status of ["pending", "approved", "ACTIVE", "failed", "expired"]) assert.equal(syncPayChargeSettlement({ ...charge, status }, null, 30, 2990, now), null)
  for (const change of [{ amount: "29.99" }, { cycle_number: 0 }, { paid_at: "invalid" }, { paid_at: "2030-01-01" }]) assert.throws(() => syncPayChargeSettlement({ ...charge, ...change }, "2026-09-01", 30, 2990, now))
  assert.throws(() => syncPayChargeSettlement(charge, null, 30, 2990, now))
})
test("Sync Pay webhooks require the secret, check the exact raw body and reject replay", () => {
  const secret = "test-only-".padEnd(40, "x")
  const raw = '{"event":"cobranca_paga"}'
  const now = 1790000000000
  const ts = String(now / 1000)
  const signature = `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`
  assert.equal(verifySyncPayWebhook(secret, null, signature, raw, now), true)
  assert.equal(verifySyncPayWebhook(secret, null, signature, raw + " ", now), false)
  assert.equal(verifySyncPayWebhook(secret, null, signature, raw, now + 301000), false)
  assert.equal(verifySyncPayWebhook(secret, `Bearer ${secret}`, "invalid", raw, now), false)
  assert.equal(verifySyncPayWebhook(secret, `Bearer ${secret}`, null, raw, now), true)
  assert.equal(verifySyncPayWebhook(secret, "Bearer old_api", null, raw, now), false)
  assert.equal(verifySyncPayWebhook("", null, null, raw, now), false)
})
