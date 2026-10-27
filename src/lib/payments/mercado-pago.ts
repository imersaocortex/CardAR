import "server-only"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { advanceBillingPeriod, amountInCents } from "./money"
import { billingAvailability } from "./settings"
import { validateMercadoPagoPayment, type MercadoPagoPayment } from "./mercado-pago-rules"
import type { Agreement } from "./service"

interface Invoice {
  id: string; provider: string; external_id: string; agreement_id: string; organization_id: string
  amount_cents: number; due_date: string; status: string; pix_code: string | null
  qr_expires_at: string | null; generation_claimed_at: string | null; invoice_url: string | null
}

async function request<T>(path: string, method = "GET", body?: unknown, idempotency?: string): Promise<T> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) throw new Error("Chave Mercado Pago não configurada")
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method, signal: AbortSignal.timeout(12000), cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(idempotency ? { "X-Idempotency-Key": idempotency } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(`Mercado Pago retornou HTTP ${response.status}; confira as credenciais e os dados do pagador`)
  return response.json() as Promise<T>
}

async function updateInvoice(id: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from("billing_invoices")
    .update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error("Não foi possível atualizar a fatura Mercado Pago")
}

function nextDueDate(agreement: Agreement) {
  return agreement.paid_until && Date.parse(agreement.paid_until) > Date.now()
    ? agreement.paid_until.slice(0, 10) : new Date().toISOString().slice(0, 10)
}

export async function startMercadoPagoAgreement(orgId: string, userId: string, planId: string) {
  const availability = await billingAvailability()
  if (!availability.mercado_pago.configured) throw new Error("Pix Mercado Pago ainda não está disponível")
  const admin = createAdminClient()
  const { data: plan } = await admin.from("plans").select("*").eq("id", planId).eq("active", true).single()
  if (!plan || plan.price <= 0 || !["monthly", "yearly"].includes(plan.billing_cycle || "monthly")) throw new Error("Plano indisponível")
  const { data: subscription } = await admin.from("subscriptions").select("*").eq("organization_id", orgId).single()
  if (!subscription) throw new Error("Assinatura da organização não encontrada")
  if (subscription.asaas_subscription_id || subscription.stripe_subscription_id) throw new Error("Uma assinatura antiga precisa ser encerrada antes da troca de provedor")
  const { data: open, error: openError } = await admin.from("billing_agreements").select("*")
    .eq("organization_id", orgId).neq("status", "canceled").maybeSingle()
  if (openError) throw new Error("Não foi possível consultar a contratação")
  if (open && (open.provider !== "mercado_pago" || open.plan_id !== planId)) throw new Error("Há outra assinatura em andamento. Encerre-a antes de trocar de plano ou provedor.")
  if (open?.status === "active") throw new Error("A assinatura já está ativa. Pague a próxima fatura quando ela estiver disponível.")
  if (!open && subscription.status === "active" && subscription.current_period_end && Date.parse(subscription.current_period_end) > Date.now())
    throw new Error("Seu período atual já está pago. Aguarde o vencimento antes de iniciar outra assinatura.")
  let agreement = open as Agreement | null
  if (!agreement) {
    const { data, error } = await admin.from("billing_agreements").insert({
      organization_id: orgId, created_by: userId, plan_id: planId, provider: "mercado_pago", pix_mode: "manual",
      amount_cents: amountInCents(plan.price), billing_cycle: plan.billing_cycle || "monthly",
    }).select().single()
    if (error || !data) throw new Error("Outra contratação pode estar em andamento. Atualize a página.")
    agreement = data as Agreement
  }
  await ensureMercadoPagoInvoice(agreement)
  return agreement
}

export async function ensureMercadoPagoInvoice(agreement: Agreement): Promise<Invoice> {
  if (agreement.provider !== "mercado_pago" || agreement.status === "canceled") throw new Error("Contrato Mercado Pago indisponível")
  const admin = createAdminClient()
  const { data: open, error: openError } = await admin.from("billing_invoices").select("*")
    .eq("agreement_id", agreement.id).eq("provider", "mercado_pago")
    .in("status", ["creating", "pending", "in_process"]).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (openError) throw new Error("Não foi possível consultar a fatura")
  let invoice = open as Invoice | null
  if (invoice?.external_id && /^\d+$/.test(invoice.external_id)) {
    await reconcileMercadoPagoPayment(invoice.external_id)
    const { data: current } = await admin.from("billing_invoices").select("*").eq("id", invoice.id).single()
    invoice = current as Invoice | null
    if (invoice?.status === "paid") return invoice
    if (invoice?.status === "pending" && invoice.qr_expires_at && Date.parse(invoice.qr_expires_at) <= Date.now()) {
      const payment = await request<MercadoPagoPayment>(`/v1/payments/${invoice.external_id}`)
      if (payment.status === "pending" || payment.status === "in_process") {
        await request(`/v1/payments/${invoice.external_id}`, "PUT", { status: "cancelled" })
      }
      await updateInvoice(invoice.id, { status: "expired", pix_code: null })
      invoice = null
    } else if (invoice?.status !== "pending" && invoice?.status !== "in_process") invoice = null
  }
  if (invoice?.external_id && /^\d+$/.test(invoice.external_id)) return invoice
  const { data: profile } = await admin.from("profiles").select("name, cpf_cnpj, email").eq("id", agreement.created_by).single()
  const document = (profile?.cpf_cnpj || "").replace(/\D/g, "")
  if (!profile?.email || ![11, 14].includes(document.length)) throw new Error("Preencha e-mail e CPF/CNPJ no perfil para pagar por Pix")
  if (!invoice) {
    const id = randomUUID()
    const { data, error } = await admin.from("billing_invoices").insert({
      id, provider: "mercado_pago", external_id: `pending:${id}`, agreement_id: agreement.id,
      organization_id: agreement.organization_id, amount_cents: agreement.amount_cents,
      due_date: nextDueDate(agreement), status: "creating",
    }).select().single()
    if (error || !data) {
      const existing = await admin.from("billing_invoices").select("*").eq("agreement_id", agreement.id)
        .eq("provider", "mercado_pago").in("status", ["creating", "pending", "in_process"]).maybeSingle()
      if (!existing.data) throw new Error("Não foi possível criar a fatura")
      invoice = existing.data as Invoice
    } else invoice = data as Invoice
  }
  const stale = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: claim, error: claimError } = await admin.from("billing_invoices")
    .update({ generation_claimed_at: new Date().toISOString() }).eq("id", invoice.id)
    .or(`generation_claimed_at.is.null,generation_claimed_at.lt.${stale}`).select("id").maybeSingle()
  if (claimError || !claim) throw new Error("A cobrança está sendo gerada. Atualize a página em instantes.")
  const { data: plan } = await admin.from("plans").select("name").eq("id", agreement.plan_id).single()
  const expiration = new Date(Date.now() + (agreement.paid_until ? 4 : 1) * 86400000).toISOString()
  const payment = await request<MercadoPagoPayment>("/v1/payments", "POST", {
    transaction_amount: agreement.amount_cents / 100,
    description: `Assinatura ${plan?.name || "CortexAR"}`.slice(0, 255),
    payment_method_id: "pix", external_reference: invoice.id, date_of_expiration: expiration,
    payer: { email: profile.email, identification: { type: document.length === 14 ? "CNPJ" : "CPF", number: document } },
  }, invoice.id)
  validateMercadoPagoPayment(payment, invoice)
  const qr = payment.point_of_interaction?.transaction_data?.qr_code
  if (!qr && payment.status !== "approved") throw new Error("Mercado Pago não retornou o código Pix")
  const { data: saved, error: saveError } = await admin.from("billing_invoices").update({
    external_id: String(payment.id), status: payment.status, pix_code: qr || null,
    qr_expires_at: payment.date_of_expiration || expiration,
    invoice_url: payment.point_of_interaction?.transaction_data?.ticket_url || null,
    generation_claimed_at: null, updated_at: new Date().toISOString(),
  }).eq("id", invoice.id).eq("status", "creating").select("id").maybeSingle()
  if (saveError) throw new Error("Não foi possível salvar a cobrança Mercado Pago")
  if (!saved) {
    await reconcileMercadoPagoPayment(String(payment.id))
    const { data: current } = await admin.from("billing_invoices").select("*").eq("id", invoice.id).single()
    if (!current) throw new Error("Não foi possível consultar a cobrança Mercado Pago")
    return current as Invoice
  }
  if (payment.status === "approved") await reconcileMercadoPagoPayment(String(payment.id))
  return { ...invoice, external_id: String(payment.id), status: payment.status, pix_code: qr || null,
    qr_expires_at: payment.date_of_expiration || expiration,
    invoice_url: payment.point_of_interaction?.transaction_data?.ticket_url || null }
}

export async function reconcileMercadoPagoPayment(paymentId: string) {
  if (!/^\d+$/.test(paymentId)) return false
  const payment = await request<MercadoPagoPayment>(`/v1/payments/${paymentId}`)
  const admin = createAdminClient()
  const { data, error } = await admin.from("billing_invoices").select("*")
    .eq("id", payment.external_reference || "").eq("provider", "mercado_pago").maybeSingle()
  if (error || !data) return false
  const invoice = data as Invoice
  const state = validateMercadoPagoPayment(payment, invoice)
  const { data: contract } = await admin.from("billing_agreements").select("*").eq("id", invoice.agreement_id).single()
  const agreement = contract as Agreement | null
  if (!agreement || agreement.provider !== "mercado_pago" || agreement.organization_id !== invoice.organization_id ||
      agreement.amount_cents !== invoice.amount_cents) throw new Error("Contrato Mercado Pago divergente")
  if (state === "paid") {
    if (agreement.status === "canceled" && !agreement.paid_until) throw new Error("Pagamento de contrato cancelado exige revisão administrativa")
    const paidAt = payment.date_approved
    if (!paidAt || !Number.isFinite(Date.parse(paidAt)) || Date.parse(paidAt) > Date.now() + 600000)
      throw new Error("Mercado Pago não retornou uma data válida de aprovação")
    const base = new Date(Math.max(Date.parse(agreement.paid_until || paidAt), Date.parse(paidAt))).toISOString()
    const end = advanceBillingPeriod(base, agreement.billing_cycle)
    const { error: settlement } = await admin.rpc("settle_billing_payment", {
      p_agreement: agreement.id, p_external_id: paymentId, p_amount_cents: agreement.amount_cents,
      p_paid_at: paidAt, p_period_end: end, p_txid: null,
    })
    if (settlement) throw new Error("Não foi possível liquidar o Pix Mercado Pago")
    await updateInvoice(invoice.id, { external_id: paymentId, status: "paid", pix_code: null, generation_claimed_at: null })
  } else if (state === "refunded") {
    const { error: reversal } = await admin.rpc("reverse_billing_payment", { p_provider: "mercado_pago", p_external_id: paymentId })
    if (reversal) throw new Error("Não foi possível reverter o pagamento")
    await updateInvoice(invoice.id, { external_id: paymentId, status: "refunded", pix_code: null, generation_claimed_at: null })
  } else {
    await updateInvoice(invoice.id, { external_id: paymentId, status: payment.status,
      pix_code: payment.point_of_interaction?.transaction_data?.qr_code || invoice.pix_code,
      qr_expires_at: payment.date_of_expiration || invoice.qr_expires_at,
      invoice_url: payment.point_of_interaction?.transaction_data?.ticket_url || invoice.invoice_url,
      generation_claimed_at: null })
  }
  return true
}

export async function reconcileMercadoPagoAgreement(agreement: Agreement) {
  const admin = createAdminClient()
  const { data, error } = await admin.from("billing_invoices").select("external_id").eq("agreement_id", agreement.id)
    .eq("provider", "mercado_pago").in("status", ["creating", "pending", "in_process", "paid"]).order("created_at", { ascending: false }).limit(10)
  if (error) throw new Error("Não foi possível consultar faturas Mercado Pago")
  for (const invoice of data || []) if (/^\d+$/.test(invoice.external_id)) await reconcileMercadoPagoPayment(invoice.external_id)
  const { data: current, error: currentError } = await admin.from("billing_agreements").select("*").eq("id", agreement.id).single()
  if (currentError || !current) throw new Error("Não foi possível atualizar o contrato Mercado Pago")
  const fresh = current as Agreement
  if (fresh.status !== "canceled" && (!fresh.paid_until || Date.parse(fresh.paid_until) <= Date.now() + 3 * 86400000))
    await ensureMercadoPagoInvoice(fresh)
}

export async function cancelMercadoPagoAgreement(agreement: Agreement) {
  const admin = createAdminClient()
  const { data: invoices } = await admin.from("billing_invoices").select("*").eq("agreement_id", agreement.id)
    .eq("provider", "mercado_pago").in("status", ["creating", "pending", "in_process"])
  for (const row of (invoices || []) as Invoice[]) {
    if (/^\d+$/.test(row.external_id)) {
      await reconcileMercadoPagoPayment(row.external_id)
      const { data: latest } = await admin.from("billing_invoices").select("status").eq("id", row.id).single()
      if (latest?.status === "paid") continue
      await request(`/v1/payments/${row.external_id}`, "PUT", { status: "cancelled" })
    } else if (row.generation_claimed_at && Date.parse(row.generation_claimed_at) > Date.now() - 5 * 60_000) {
      throw new Error("Uma cobrança está sendo preparada. Aguarde alguns minutos antes de cancelar.")
    }
    await updateInvoice(row.id, { status: "cancelled", pix_code: null })
  }
  const { error } = await admin.from("billing_agreements").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", agreement.id)
  if (error) throw new Error("Não foi possível cancelar a assinatura")
  await admin.from("subscriptions").update({ cancel_at_period_end: true })
    .eq("organization_id", agreement.organization_id).eq("billing_agreement_id", agreement.id)
}
