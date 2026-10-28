import test from "node:test"
import assert from "node:assert/strict"
import { validateMercadoPagoPayment } from "../src/lib/payments/mercado-pago-rules.ts"
import { experienceAccessGranted, subscriptionGrantsAccess } from "../src/lib/payments/access.ts"
import { verifyMercadoPagoSignature } from "../src/lib/payments/mercado-pago-signature.ts"
import { createHmac } from "node:crypto"

const invoice = { id: "e7c83c70-34b8-413f-a416-7115711cb29f", external_id: "123456", amount_cents: 2990 }
const payment = { id: 123456, status: "pending", payment_method_id: "pix", transaction_amount: 29.90,
  currency_id: "BRL", external_reference: invoice.id }

test("Mercado Pago only settles the verified Pix for this invoice and amount", () => {
  assert.equal(validateMercadoPagoPayment(payment, invoice), "pending")
  assert.equal(validateMercadoPagoPayment({ ...payment, status: "approved" }, invoice), "paid")
  assert.equal(validateMercadoPagoPayment({ ...payment, status: "refunded" }, invoice), "refunded")
  assert.throws(() => validateMercadoPagoPayment({ ...payment, external_reference: "another" }, invoice))
  assert.throws(() => validateMercadoPagoPayment({ ...payment, id: 111 }, invoice))
  assert.throws(() => validateMercadoPagoPayment({ ...payment, payment_method_id: "visa" }, invoice))
  assert.throws(() => validateMercadoPagoPayment({ ...payment, transaction_amount: 2.99 }, invoice))
  assert.throws(() => validateMercadoPagoPayment({ ...payment, currency_id: "ARS" }, invoice))
})

test("a confirmed Pix can recover an invoice before its creation response was saved", () => {
  assert.equal(validateMercadoPagoPayment({ ...payment, status: "approved" },
    { ...invoice, external_id: `pending:${invoice.id}` }), "paid")
})

test("a project stops at the exact paid-period deadline before the daily renewal job runs", () => {
  const end = "2026-11-01T12:00:00.000Z"
  assert.equal(subscriptionGrantsAccess({ status: "active", current_period_end: end }, Date.parse(end) - 1), true)
  assert.equal(subscriptionGrantsAccess({ status: "active", current_period_end: end }, Date.parse(end)), false)
  assert.equal(subscriptionGrantsAccess({ status: "past_due", current_period_end: end }, Date.parse(end) - 1), false)
  assert.equal(subscriptionGrantsAccess({ status: "trialing", trial_ends_at: end }, Date.parse(end)), false)
})

test("only a verified super-admin-owned organization bypasses an expired subscription", () => {
  const expired = { status: "active", current_period_end: "2026-07-03T19:35:03Z" }
  const now = Date.parse("2026-10-28T12:00:00Z")
  assert.equal(experienceAccessGranted(expired, false, now), false)
  assert.equal(experienceAccessGranted(expired, true, now), true)
  assert.equal(experienceAccessGranted({ status: "past_due" }, false, now), false)
  assert.equal(experienceAccessGranted(null, false, now), false)
})

test("webhook requires a valid Mercado Pago HMAC over payment, request and timestamp", () => {
  const secret = "private-webhook-secret"
  const requestId = "request-123"
  const ts = "1782563610"
  const signature = createHmac("sha256", secret).update(`id:123456;request-id:${requestId};ts:${ts};`).digest("hex")
  assert.equal(verifyMercadoPagoSignature(secret, `ts=${ts},v1=${signature}`, requestId, "123456"), true)
  assert.equal(verifyMercadoPagoSignature(secret, `ts=${ts},v1=${signature}`, requestId, "123457"), false)
  assert.equal(verifyMercadoPagoSignature(secret, `ts=${ts},v1=${signature}`, "other-request", "123456"), false)
  assert.equal(verifyMercadoPagoSignature(secret, `ts=${ts},v1=${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`, requestId, "123456"), false)
})
