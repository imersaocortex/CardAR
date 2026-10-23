export interface AsaasPaymentIdentity {
  id: string; customer: string; subscription?: string | null; pixAutomaticAuthorizationId?: string | null
  externalReference?: string | null; billingType: string; value: number; dueDate: string; status: string
}
export interface AsaasAgreementIdentity {
  id: string; external_id: string | null; asaas_customer_id: string | null
  asaas_subscription_id: string | null; amount_cents: number
}
export function validateAsaasPayment(agreement: AsaasAgreementIdentity, payment: AsaasPaymentIdentity, verifiedInitial = false) {
  const value = String(payment.value)
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Valor monetário inválido")
  const [whole, fraction = ""] = value.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  const linked = (payment.subscription && agreement.asaas_subscription_id === payment.subscription) ||
    (payment.pixAutomaticAuthorizationId && agreement.external_id === payment.pixAutomaticAuthorizationId) ||
    payment.externalReference === agreement.id || verifiedInitial
  if (!linked || payment.customer !== agreement.asaas_customer_id || payment.billingType !== "PIX" ||
      !Number.isSafeInteger(cents) || cents !== agreement.amount_cents || !/^\d{4}-\d{2}-\d{2}$/.test(payment.dueDate)) {
    throw new Error("Cobrança Asaas divergente")
  }
  return payment.status === "RECEIVED" || payment.status === "CONFIRMED" ? "paid" :
    ["REFUNDED", "PARTIALLY_REFUNDED", "CHARGEBACK_REQUESTED"].includes(payment.status) ? "refunded" : "pending"
}
