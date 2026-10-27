export interface MercadoPagoPayment {
  id: number | string
  status: string
  payment_method_id: string
  transaction_amount: number
  currency_id?: string
  external_reference?: string
  date_approved?: string | null
  date_of_expiration?: string | null
  point_of_interaction?: { transaction_data?: { qr_code?: string; ticket_url?: string } }
}

export function validateMercadoPagoPayment(payment: MercadoPagoPayment, invoice: {
  id: string; external_id: string; amount_cents: number
}): "paid" | "refunded" | "pending" {
  if (payment.external_reference !== invoice.id ||
      !/^\d+$/.test(String(payment.id)) ||
      (invoice.external_id !== `pending:${invoice.id}` && invoice.external_id !== String(payment.id)) ||
      payment.payment_method_id !== "pix" || payment.currency_id !== "BRL" ||
      !Number.isFinite(payment.transaction_amount) ||
      Math.abs(payment.transaction_amount * 100 - invoice.amount_cents) > 0.000001) {
    throw new Error("Pagamento Mercado Pago divergente da fatura")
  }
  if (payment.status === "approved") return "paid"
  if (["refunded", "charged_back"].includes(payment.status)) return "refunded"
  return "pending"
}
