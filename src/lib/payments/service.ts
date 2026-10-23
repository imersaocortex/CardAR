import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { asaasRequest, type AsaasAuthorization, type AsaasPayment } from "./asaas"
import { advanceBillingPeriod, amountInCents } from "./money"
import { validateAsaasPayment } from "./asaas-rules"
import { billingAvailability } from "./settings"

export { billingAvailability } from "./settings"

export interface Agreement {
  id: string; organization_id: string; plan_id: string; created_by: string; provider: string
  pix_mode: "automatic" | null; status: "pending" | "active" | "canceled"
  amount_cents: number; billing_cycle: "monthly" | "yearly"; external_id: string | null
  checkout_url: string | null; pix_code: string | null; setup_stage: string; paid_until: string | null
  asaas_customer_id: string | null; asaas_subscription_id: string | null; qr_expires_at: string | null
  created_at: string
}

function contractId(agreement: Agreement) { return agreement.id.replace(/-/g, "") }
function money(cents: number) { return cents / 100 }
function paymentDate(payment: AsaasPayment): string {
  const date = payment.paymentDate || payment.confirmedDate || payment.clientPaymentDate
  if (!date) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00.000Z`
  const parsed = new Date(date)
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now() + 600000) throw new Error("Data de pagamento inválida")
  return parsed.toISOString()
}
function expiryDate(value: string | undefined) {
  if (!value) return null
  const local = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value)
  const parsed = new Date(local ? `${local[3]}-${local[2]}-${local[1]}T${local[4]}-03:00` : value.replace(" ", "T"))
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}
async function updateAgreement(id: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from("billing_agreements")
    .update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error("Não foi possível atualizar a assinatura")
}

async function asaasCustomer(agreement: Agreement, profile: { name: string; cpf_cnpj: string; email: string | null }) {
  if (agreement.asaas_customer_id) return agreement.asaas_customer_id
  const admin = createAdminClient()
  let mayCreate = false
  if (agreement.setup_stage === "new") {
    const { data: claim, error: claimError } = await admin.from("billing_agreements")
      .update({ setup_stage: "creating_customer" }).eq("id", agreement.id).eq("setup_stage", "new").select("id").maybeSingle()
    if (claimError || !claim) throw new Error("O cliente está sendo cadastrado. Atualize a página.")
    mayCreate = true
  } else if (agreement.setup_stage !== "creating_customer") {
    throw new Error("Cadastro do cliente em estado inesperado; contate o suporte")
  }
  const query = `/customers?externalReference=${encodeURIComponent(agreement.organization_id)}&limit=100`
  const found = await asaasRequest<{ data: { id: string; externalReference?: string; cpfCnpj?: string }[] }>(query)
  const matching = found.data.filter((item) => item.externalReference === agreement.organization_id && item.cpfCnpj?.replace(/\D/g, "") === profile.cpf_cnpj)
  if (matching.length > 1) throw new Error("Há clientes duplicados na Asaas; confira o cadastro antes de contratar")
  let id = matching[0]?.id
  if (!id) {
    if (!mayCreate) throw new Error("Cadastro na Asaas em preparação. Atualize a página em instantes.")
    const customer = await asaasRequest<{ id: string }>("/customers", "POST", {
      name: profile.name, cpfCnpj: profile.cpf_cnpj, email: profile.email || undefined,
      externalReference: agreement.organization_id, notificationDisabled: true,
    })
    id = customer.id
  }
  if (!id) throw new Error("Cliente Asaas sem identificação")
  await updateAgreement(agreement.id, { asaas_customer_id: id, setup_stage: "customer_ready" })
  return id
}

export async function startAgreement(orgId: string, userId: string, planId: string) {
  const availability = await billingAvailability()
  if (!availability.asaas.configured) throw new Error("Pix Automático ainda não está disponível")
  const admin = createAdminClient()
  const { data: plan } = await admin.from("plans").select("*").eq("id", planId).eq("active", true).single()
  if (!plan || plan.price <= 0 || !["monthly", "yearly"].includes(plan.billing_cycle || "monthly")) throw new Error("Plano indisponível")
  const { data: subscription } = await admin.from("subscriptions").select("*").eq("organization_id", orgId).single()
  if (!subscription) throw new Error("Assinatura da organização não encontrada")
  if (subscription.asaas_subscription_id || subscription.stripe_subscription_id) throw new Error("Uma assinatura antiga precisa ser encerrada pela administração")
  const existingLookup = await admin.from("billing_agreements").select("*")
    .eq("organization_id", orgId).neq("status", "canceled").maybeSingle()
  let existing = existingLookup.data
  const existingError = existingLookup.error
  if (existingError) throw new Error("Não foi possível consultar a contratação")
  if (!existing && subscription.payment_provider === "asaas" && subscription.status === "active" &&
      subscription.current_period_end && new Date(subscription.current_period_end).getTime() > Date.now()) {
    throw new Error("Seu período já está pago. Inicie outra autorização depois do vencimento para evitar cobrança duplicada.")
  }
  if (existing && (existing.provider !== "asaas" || existing.plan_id !== planId || existing.status === "active")) throw new Error("Já existe uma contratação em andamento. Encerre-a antes de alterar o plano.")
  if (!existing) {
    const { data, error } = await admin.from("billing_agreements").insert({
      organization_id: orgId, created_by: userId, plan_id: planId, provider: "asaas", pix_mode: "automatic",
      amount_cents: amountInCents(plan.price), billing_cycle: plan.billing_cycle || "monthly",
    }).select().single()
    if (error || !data) throw new Error("Outra contratação pode estar em andamento. Atualize a página.")
    existing = data
  }
  const agreement = existing as Agreement
  if (agreement.external_id) {
    if (agreement.pix_code) return agreement
    const remote = await reconcileAsaasAuthorization(agreement)
    if (remote?.payload) return { ...agreement, pix_code: remote.payload }
    throw new Error("A autorização foi criada, mas o QR Code ainda não está disponível. Consulte o suporte.")
  }
  if (agreement.setup_stage === "creating_authorization") throw new Error("A autorização está sendo conferida. Não gere outra cobrança; contate o suporte.")
  const { data: profile } = await admin.from("profiles").select("name, cpf_cnpj, email").eq("id", userId).single()
  const document = (profile?.cpf_cnpj || "").replace(/\D/g, "")
  if (!profile?.name?.trim() || ![11, 14].includes(document.length)) throw new Error("Preencha nome e CPF/CNPJ no perfil para autorizar o Pix Automático")
  const customerId = await asaasCustomer(agreement, { name: profile.name.trim(), cpf_cnpj: document, email: profile.email })
  const { data: claim, error: claimError } = await admin.from("billing_agreements")
    .update({ setup_stage: "creating_authorization" }).eq("id", agreement.id).eq("setup_stage", "customer_ready").select("id").maybeSingle()
  if (claimError || !claim) throw new Error("A autorização já está em preparação. Atualize a página.")
  const firstPeriodEnd = advanceBillingPeriod(new Date().toISOString(), agreement.billing_cycle)
  const remote = await asaasRequest<AsaasAuthorization>("/pix/automatic/authorizations", "POST", {
    frequency: agreement.billing_cycle === "yearly" ? "ANNUALLY" : "MONTHLY",
    contractId: contractId(agreement), startDate: firstPeriodEnd.slice(0, 10),
    value: money(agreement.amount_cents), description: `Assinatura ${plan.name}`.slice(0, 35),
    customerId, paymentCreationMode: "SUBSCRIPTION", retryPolicy: "NOT_ALLOWED",
    immediateQrCode: { expirationSeconds: 3600, originalValue: money(agreement.amount_cents), description: `Assinatura ${plan.name}`.slice(0, 35) },
  })
  if (!remote.id) throw new Error("Asaas não retornou o identificador da autorização")
  await updateAgreement(agreement.id, { external_id: remote.id, asaas_subscription_id: remote.subscriptionId || null,
    pix_code: remote.payload || null, qr_expires_at: expiryDate(remote.immediateQrCode?.expirationDate), setup_stage: remote.payload ? "ready" : "awaiting_qr" })
  if (!remote.payload) throw new Error("Aguarde a emissão do QR Code na Asaas e tente novamente")
  return { ...agreement, external_id: remote.id, asaas_customer_id: customerId, asaas_subscription_id: remote.subscriptionId || null,
    pix_code: remote.payload, qr_expires_at: expiryDate(remote.immediateQrCode?.expirationDate), setup_stage: "ready" }
}

async function markCanceled(agreement: Agreement) {
  await updateAgreement(agreement.id, { status: "canceled", setup_stage: "authorization_ended" })
  const { error } = await createAdminClient().from("subscriptions")
    .update({ cancel_at_period_end: true }).eq("organization_id", agreement.organization_id).eq("billing_agreement_id", agreement.id)
  if (error) throw new Error("Não foi possível registrar o fim da recorrência")
}

export async function reconcileAsaasAuthorization(agreement: Agreement) {
  if (agreement.provider !== "asaas" || !agreement.external_id) return null
  const remote = await asaasRequest<AsaasAuthorization>(`/pix/automatic/authorizations/${encodeURIComponent(agreement.external_id)}`)
  if (remote.id !== agreement.external_id || remote.contractId !== contractId(agreement) ||
      remote.customerId !== agreement.asaas_customer_id || remote.paymentCreationMode !== "SUBSCRIPTION" ||
      remote.frequency !== (agreement.billing_cycle === "yearly" ? "ANNUALLY" : "MONTHLY") ||
      amountInCents(remote.value ?? -1) !== agreement.amount_cents) throw new Error("Autorização Asaas divergente")
  if (remote.subscriptionId && remote.subscriptionId !== agreement.asaas_subscription_id) {
    await updateAgreement(agreement.id, { asaas_subscription_id: remote.subscriptionId })
    agreement.asaas_subscription_id = remote.subscriptionId
  }
  if (remote.payload && !agreement.pix_code) await updateAgreement(agreement.id, { pix_code: remote.payload, qr_expires_at: expiryDate(remote.immediateQrCode?.expirationDate), setup_stage: "ready" })
  if (["CANCELLED", "EXPIRED", "REFUSED"].includes(remote.status) && agreement.status !== "canceled") await markCanceled(agreement)
  else if (remote.status === "ACTIVE" && !["authorized", "initial_settled"].includes(agreement.setup_stage)) await updateAgreement(agreement.id, { setup_stage: "authorized" })
  return remote
}

export async function findAsaasAgreement(payment: AsaasPayment): Promise<Agreement | null> {
  const admin = createAdminClient()
  let agreement: Agreement | null = null
  if (payment.subscription) {
    const { data } = await admin.from("billing_agreements").select("*").eq("provider", "asaas").eq("asaas_subscription_id", payment.subscription).maybeSingle()
    agreement = data as Agreement | null
  }
  if (!agreement && payment.pixAutomaticAuthorizationId) {
    const { data } = await admin.from("billing_agreements").select("*").eq("provider", "asaas").eq("external_id", payment.pixAutomaticAuthorizationId).maybeSingle()
    agreement = data as Agreement | null
  }
  if (!agreement && payment.externalReference && /^[0-9a-f-]{36}$/i.test(payment.externalReference)) {
    const { data } = await admin.from("billing_agreements").select("*").eq("provider", "asaas").eq("id", payment.externalReference).maybeSingle()
    agreement = data as Agreement | null
  }
  if (!agreement && payment.pixTransaction && payment.customer) {
    const { data: candidates } = await admin.from("billing_agreements").select("*")
      .eq("provider", "asaas").eq("asaas_customer_id", payment.customer).not("external_id", "is", null)
      .order("created_at", { ascending: false }).limit(10)
    for (const candidate of (candidates || []) as Agreement[]) {
      if (await verifiedInitialPayment(payment, candidate)) {
        if (agreement) throw new Error("Pagamento inicial associado a mais de um contrato")
        agreement = candidate
      }
    }
  }
  return agreement
}

async function verifiedInitialPayment(payment: AsaasPayment, agreement: Agreement) {
  if (!payment.pixTransaction || !agreement.external_id || payment.customer !== agreement.asaas_customer_id) return false
  const [authorization, transaction] = await Promise.all([
    asaasRequest<AsaasAuthorization>(`/pix/automatic/authorizations/${encodeURIComponent(agreement.external_id)}`),
    asaasRequest<{ endToEndIdentifier?: string }>(`/pix/transactions/${encodeURIComponent(payment.pixTransaction)}`),
  ])
  return authorization.id === agreement.external_id && authorization.contractId === contractId(agreement) &&
    !!authorization.endToEndIdentifier && authorization.endToEndIdentifier === transaction.endToEndIdentifier
}

export async function reconcileAsaasPayment(paymentId: string, knownAgreement?: Agreement) {
  const payment = await asaasRequest<AsaasPayment>(`/payments/${encodeURIComponent(paymentId)}`)
  const agreement = knownAgreement || await findAsaasAgreement(payment)
  if (!agreement) return false
  const initialVerified = agreement.setup_stage !== "initial_settled" &&
    await verifiedInitialPayment(payment, agreement)
  const state = validateAsaasPayment(agreement, payment, initialVerified)
  const admin = createAdminClient()
  const refunded = state === "refunded"
  const paid = state === "paid"
  const { error } = await admin.from("billing_invoices").upsert({
    provider: "asaas", external_id: payment.id, agreement_id: agreement.id, organization_id: agreement.organization_id,
    amount_cents: agreement.amount_cents, due_date: payment.dueDate, status: refunded ? "refunded" : paid ? "paid" : payment.status,
    invoice_url: payment.invoiceUrl || null, updated_at: new Date().toISOString(),
  }, { onConflict: "provider,external_id" })
  if (error) throw new Error("Não foi possível registrar a fatura")
  if (refunded) {
    const { error: reversal } = await admin.rpc("reverse_billing_payment", { p_provider: "asaas", p_external_id: payment.id })
    if (reversal) throw new Error("Não foi possível reverter o pagamento")
    return true
  }
  if (!paid) return true
  const paidAt = paymentDate(payment)
  const periodStart = new Date(`${payment.dueDate}T12:00:00.000Z`)
  const end = advanceBillingPeriod(new Date(Math.max(periodStart.getTime(), new Date(paidAt).getTime())).toISOString(), agreement.billing_cycle)
  const { error: settlement } = await admin.rpc("settle_billing_payment", {
    p_agreement: agreement.id, p_external_id: payment.id, p_amount_cents: agreement.amount_cents,
    p_paid_at: paidAt, p_period_end: end, p_txid: null,
  })
  if (settlement) throw new Error("Não foi possível liquidar o pagamento")
  if (initialVerified && agreement.setup_stage !== "initial_settled") {
    await updateAgreement(agreement.id, { setup_stage: "initial_settled" })
    agreement.setup_stage = "initial_settled"
  }
  return true
}

export async function reconcileAsaasAgreement(agreement: Agreement) {
  const remote = await reconcileAsaasAuthorization(agreement)
  if (!remote) return
  if (agreement.setup_stage !== "initial_settled" && agreement.asaas_customer_id) {
    const list = await asaasRequest<{ data: AsaasPayment[]; hasMore?: boolean }>(`/payments?customer=${encodeURIComponent(agreement.asaas_customer_id)}&billingType=PIX&limit=100`)
    for (const payment of list.data || []) {
      if (await verifiedInitialPayment(payment, agreement)) {
        await reconcileAsaasPayment(payment.id, agreement)
        if (agreement.setup_stage === "initial_settled") break
      }
    }
    if (list.hasMore) throw new Error("Conciliação inicial Asaas excedeu 100 cobranças")
  }
  if (!agreement.asaas_subscription_id) return
  const list = await asaasRequest<{ data: AsaasPayment[]; hasMore?: boolean }>(`/payments?subscription=${encodeURIComponent(agreement.asaas_subscription_id)}&limit=100`)
  for (const payment of list.data || []) await reconcileAsaasPayment(payment.id, agreement)
  if (list.hasMore) throw new Error("Conciliação Asaas excedeu 100 cobranças; pagine antes de continuar")
}

export async function cancelAgreement(agreement: Agreement) {
  if (agreement.provider !== "asaas") throw new Error("Provedor antigo exige suporte administrativo")
  if (agreement.external_id) {
    const remote = await reconcileAsaasAuthorization(agreement)
    if (remote && !["CANCELLED", "EXPIRED", "REFUSED"].includes(remote.status)) {
      await asaasRequest(`/pix/automatic/authorizations/${encodeURIComponent(agreement.external_id)}`, "DELETE")
    }
  }
  await markCanceled(agreement)
}
