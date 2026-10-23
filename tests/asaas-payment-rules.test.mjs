import test from "node:test"
import assert from "node:assert/strict"
import { validateAsaasPayment } from "../src/lib/payments/asaas-rules.ts"

const agreement = { id: "agreement-1", external_id: "authorization-1", asaas_customer_id: "customer-1", asaas_subscription_id: "subscription-1", amount_cents: 2990 }
const payment = { id: "payment-1", customer: "customer-1", subscription: "subscription-1", billingType: "PIX", value: 29.90, dueDate: "2026-11-22", status: "PENDING" }

test("Asaas only settles confirmed payments attached to the correct customer, subscription, amount and method", () => {
  assert.equal(validateAsaasPayment(agreement, payment), "pending")
  assert.equal(validateAsaasPayment(agreement, { ...payment, status: "RECEIVED" }), "paid")
  assert.throws(() => validateAsaasPayment(agreement, { ...payment, customer: "another" }))
  assert.throws(() => validateAsaasPayment(agreement, { ...payment, subscription: "another" }))
  assert.throws(() => validateAsaasPayment(agreement, { ...payment, billingType: "BOLETO" }))
  assert.throws(() => validateAsaasPayment(agreement, { ...payment, value: 2.99 }))
})

test("initial Pix requires separately verified transaction identity when no subscription is attached", () => {
  const initial = { ...payment, subscription: null, status: "RECEIVED" }
  assert.throws(() => validateAsaasPayment(agreement, initial))
  assert.equal(validateAsaasPayment(agreement, initial, true), "paid")
  assert.equal(validateAsaasPayment(agreement, { ...payment, status: "REFUNDED" }), "refunded")
})
