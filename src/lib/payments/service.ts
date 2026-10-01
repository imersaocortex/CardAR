import "server-only"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { paypalRequest, type PayPalSubscription } from "./paypal"
import { efiRequest, EfiError, type PixCharge, type PixRecurrence } from "./efi"
import { advanceBillingPeriod, amountInCents } from "./money"

export interface Agreement {
  id: string; organization_id: string; plan_id: string; created_by: string; provider: "paypal" | "efi";
  pix_mode: "manual" | "automatic" | null; status: "pending" | "active" | "canceled";
  amount_cents: number; billing_cycle: "monthly" | "yearly"; external_id: string | null;
  checkout_url: string | null; pix_code: string | null; setup_stage: string; paid_until: string | null; created_at: string
}
export interface Charge { id: string; agreement_id: string; organization_id: string; txid: string; kind: "immediate" | "recurring"; due_date: string; period_end: string; pix_code: string | null; status: string; expires_at?: string | null }

export function billingAvailability() {
  const enabled = process.env.BILLING_V2_ENABLED === "true"
  const live = process.env.BILLING_LIVE_ENABLED === "true"
  const pixMode = process.env.EFI_PIX_MODE === "manual" ? "manual" as const : "automatic" as const
  return {
    paypal: { configured: enabled && !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID) && (process.env.PAYPAL_ENVIRONMENT !== "production" || live) },
    efi: { configured: enabled && !!(process.env.EFI_CLIENT_ID && process.env.EFI_CLIENT_SECRET && process.env.EFI_CERTIFICATE_BASE64 && process.env.EFI_PIX_KEY && process.env.EFI_WEBHOOK_TOKEN) && (pixMode === "manual" || !!process.env.EFI_ACCOUNT_NUMBER) && (process.env.EFI_ENVIRONMENT !== "production" || live) },
    pixMode,
  }
}
function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000")
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Endereço da aplicação inválido")
  if (process.env.BILLING_LIVE_ENABLED === "true" && url.protocol !== "https:") throw new Error("Cobranças reais exigem APP_URL HTTPS")
  return url.origin
}
async function updateAgreement(id: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from("billing_agreements").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error("Não foi possível registrar a atualização da assinatura")
}

export async function startAgreement(orgId: string, userId: string, planId: string, provider: "paypal" | "efi") {
  const availability = billingAvailability()
  if (!availability[provider].configured) throw new Error("Esta forma de pagamento ainda não está disponível")
  const admin = createAdminClient()
  const { data: plan, error: planError } = await admin.from("plans").select("*").eq("id", planId).eq("active", true).single()
  if (planError || !plan || plan.price <= 0) throw new Error("Plano indisponível para assinatura")
  const { data: sub, error: subError } = await admin.from("subscriptions").select("*").eq("organization_id", orgId).single()
  if (subError || !sub) throw new Error("Assinatura da organização não encontrada")
  if (sub.asaas_subscription_id || sub.stripe_subscription_id) {
    throw new Error("Sua assinatura atual precisa ser migrada pela administração antes de contratar novamente")
  }
  let { data: existing } = await admin.from("billing_agreements").select("*").eq("organization_id", orgId).neq("status", "canceled").maybeSingle()
  if (existing && (existing.plan_id !== planId || existing.provider !== provider || existing.status === "active")) throw new Error("Já existe uma assinatura ou contratação em andamento. Cancele-a antes de trocar de plano ou provedor.")
  if (!existing) {
    const { data, error } = await admin.from("billing_agreements").insert({ organization_id: orgId, created_by: userId, plan_id: planId, provider, pix_mode: provider === "efi" ? availability.pixMode : null, amount_cents: amountInCents(plan.price), billing_cycle: plan.billing_cycle || "monthly" }).select().single()
    if (error || !data) throw new Error("Outra contratação pode estar em andamento. Atualize a página.")
    existing = data
  }
  const agreement = existing as Agreement
  if (provider === "efi" && agreement.pix_mode === "automatic" && agreement.pix_code && agreement.status === "pending") {
    const { data: initialCharge, error: chargeError } = await admin.from("billing_charges").select("*").eq("agreement_id", agreement.id).eq("kind", "immediate").order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (chargeError) throw new Error("Não foi possível verificar a cobrança Pix")
    if (initialCharge?.expires_at && new Date(initialCharge.expires_at).getTime() <= Date.now()) {
      await reconcilePixCharge(initialCharge as Charge, agreement)
      const { data: refreshed } = await admin.from("billing_charges").select("status").eq("id", initialCharge.id).single()
      if (refreshed?.status !== "paid") {
        await cancelAgreement(agreement)
        throw new Error("O QR Code expirou. Inicie uma nova contratação para gerar outra autorização.")
      }
    }
  }
  if (agreement.checkout_url || (agreement.pix_code && agreement.pix_mode === "automatic")) return agreement
  if (provider === "paypal") {
    let remotePlan = plan.paypal_plan_id as string | null
    if (remotePlan) {
      const remote = await paypalRequest<{ status: string; billing_cycles: { tenure_type: string; frequency: { interval_unit: string; interval_count: number }; pricing_scheme?: { fixed_price?: { value: string; currency_code: string } } }[] }>(`/v1/billing/plans/${encodeURIComponent(remotePlan)}`)
      const cycle = remote.billing_cycles.find((item) => item.tenure_type === "REGULAR")
      if (remote.status !== "ACTIVE" || !cycle?.pricing_scheme?.fixed_price || cycle.pricing_scheme.fixed_price.currency_code !== "BRL" || amountInCents(cycle.pricing_scheme.fixed_price.value) !== agreement.amount_cents || cycle.frequency.interval_count !== 1 || cycle.frequency.interval_unit !== (agreement.billing_cycle === "yearly" ? "YEAR" : "MONTH") || remote.billing_cycles.some((item) => item.tenure_type === "TRIAL")) throw new Error("O plano PayPal não corresponde ao preço e à periodicidade cadastrados")
    } else {
      const product = await paypalRequest<{ id: string }>("/v1/catalogs/products", "POST", { name: plan.name, type: "SERVICE", category: "SOFTWARE" }, `product-${plan.id}`)
      const remote = await paypalRequest<{ id: string }>("/v1/billing/plans", "POST", {
        product_id: product.id, name: plan.name, status: "ACTIVE",
        billing_cycles: [{ frequency: { interval_unit: agreement.billing_cycle === "yearly" ? "YEAR" : "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: (agreement.amount_cents / 100).toFixed(2), currency_code: "BRL" } } }],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
      }, `plan-${agreement.id}`)
      remotePlan = remote.id
    }
    const remote = await paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", "POST", {
      plan_id: remotePlan, custom_id: agreement.id,
      application_context: { shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW", return_url: `${appOrigin()}/billing?checkout_success=true`, cancel_url: `${appOrigin()}/billing` },
    }, agreement.id)
    const url = remote.links?.find((link) => link.rel === "approve")?.href
    if (!url || !/^https:\/\/([a-z0-9-]+\.)?paypal\.com\//i.test(url)) throw new Error("Link de aprovação PayPal inválido")
    await updateAgreement(agreement.id, { external_id: remote.id, checkout_url: url, setup_stage: "ready" })
    return { ...agreement, external_id: remote.id, checkout_url: url }
  }
  const charge = await createPixCharge(agreement)
  if (agreement.pix_mode === "manual") {
    await updateAgreement(agreement.id, { pix_code: charge.pix_code, setup_stage: "ready" })
    return { ...agreement, pix_code: charge.pix_code }
  }
  if (agreement.external_id) {
    const remote = await efiRequest<PixRecurrence>(`/v2/rec/${encodeURIComponent(agreement.external_id)}?txid=${charge.txid}`)
    const code = remote.dadosQR?.pixCopiaECola
    if (!code) throw new Error("A autorização Pix ainda não está disponível. Tente novamente.")
    await updateAgreement(agreement.id, { pix_code: code, setup_stage: "ready" })
    return { ...agreement, pix_code: code }
  }
  // Efí recurrence creation has no caller-supplied ID. Do not blindly retry an uncertain POST.
  const { data: claim } = await admin.from("billing_agreements").update({ setup_stage: "creating_recurrence" }).eq("id", agreement.id).eq("setup_stage", "new").select("id").maybeSingle()
  if (!claim) throw new Error("A autorização Pix está em preparação. Caso persista, a administração precisa conferir a operação na Efí.")
  const { data: profile } = await admin.from("profiles").select("name, cpf_cnpj").eq("id", userId).single()
  const document = (profile?.cpf_cnpj || "").replace(/\D/g, "")
  if (![11, 14].includes(document.length)) { await updateAgreement(agreement.id, { setup_stage: "new" }); throw new Error("Preencha seu CPF ou CNPJ no perfil para autorizar o Pix Automático") }
  const loc = await efiRequest<{ id: number }>("/v2/locrec", "POST", {})
  await updateAgreement(agreement.id, { setup_loc: loc.id })
  const remote = await efiRequest<PixRecurrence>("/v2/rec", "POST", {
    vinculo: { contrato: agreement.id, devedor: { [document.length === 11 ? "cpf" : "cnpj"]: document, nome: profile!.name }, objeto: `Assinatura ${plan.name}` },
    calendario: { dataInicial: charge.period_end.slice(0, 10), periodicidade: agreement.billing_cycle === "yearly" ? "ANUAL" : "MENSAL" },
    valor: { valorRec: (agreement.amount_cents / 100).toFixed(2) }, politicaRetentativa: "NAO_PERMITE", loc: loc.id,
    ativacao: { dadosJornada: { txid: charge.txid } },
  })
  await updateAgreement(agreement.id, { external_id: remote.idRec })
  const qr = await efiRequest<PixRecurrence>(`/v2/rec/${encodeURIComponent(remote.idRec)}?txid=${charge.txid}`)
  if (!qr.dadosQR?.pixCopiaECola) throw new Error("Aguarde a geração do QR Code e tente novamente")
  await updateAgreement(agreement.id, { pix_code: qr.dadosQR.pixCopiaECola, setup_stage: "ready" })
  return { ...agreement, external_id: remote.idRec, pix_code: qr.dadosQR.pixCopiaECola }
}

export async function createPixCharge(agreement: Agreement, renewal = false) {
  const admin = createAdminClient()
  const due = renewal && agreement.paid_until && new Date(agreement.paid_until).getTime() > Date.now() ? agreement.paid_until : new Date().toISOString()
  const kind = renewal && agreement.pix_mode === "automatic" ? "recurring" : "immediate"
  const dueDate = due.slice(0, 10)
  const { data: current } = await admin.from("billing_charges").select("*").eq("agreement_id", agreement.id).eq("due_date", dueDate).in("status", ["pending", "paid"]).maybeSingle()
  let charge = current as Charge | null
  if (!charge) {
    const { data, error } = await admin.from("billing_charges").insert({ agreement_id: agreement.id, organization_id: agreement.organization_id, txid: randomUUID().replace(/-/g, ""), kind, due_date: dueDate, period_end: advanceBillingPeriod(due, agreement.billing_cycle) }).select().single()
    if (error || !data) throw new Error("A cobrança está sendo preparada. Atualize a página.")
    charge = data as Charge
  }
  if (charge.status === "paid") return charge
  if (charge.expires_at && new Date(charge.expires_at).getTime() <= Date.now()) {
    await reconcilePixCharge(charge, agreement)
    const { data: refreshed } = await admin.from("billing_charges").select("*").eq("id", charge.id).single()
    if (refreshed?.status === "paid") return refreshed as Charge
    const { error } = await admin.from("billing_charges").update({ status: "expired" }).eq("id", charge.id).eq("status", "pending")
    if (error) throw new Error("Não foi possível atualizar a cobrança expirada")
    return createPixCharge(agreement, renewal)
  }
  if (charge.pix_code) return charge
  const path = `/v2/${kind === "recurring" ? "cobr" : "cob"}/${charge.txid}`
  let remote: PixCharge
  try { remote = await efiRequest<PixCharge>(path) }
  catch (error) {
    if (!(error instanceof EfiError) || error.status !== 404) throw error
    if (kind === "recurring") {
      if (!agreement.external_id || !process.env.EFI_ACCOUNT_NUMBER) throw new Error("Conta recebedora do Pix Automático não configurada")
      remote = await efiRequest<PixCharge>(path, "PUT", { idRec: agreement.external_id, calendario: { dataDeVencimento: dueDate }, valor: { original: (agreement.amount_cents / 100).toFixed(2) }, ajusteDiaUtil: true, recebedor: { agencia: process.env.EFI_ACCOUNT_BRANCH || "0001", conta: process.env.EFI_ACCOUNT_NUMBER, tipoConta: "PAGAMENTO" } })
    } else {
      remote = await efiRequest<PixCharge>(path, "PUT", { calendario: { expiracao: 86400 }, valor: { original: (agreement.amount_cents / 100).toFixed(2) }, chave: process.env.EFI_PIX_KEY, solicitacaoPagador: "Assinatura da plataforma AR" })
    }
  }
  const expiresAt = remote.calendario?.criacao && remote.calendario.expiracao ? new Date(new Date(remote.calendario.criacao).getTime() + remote.calendario.expiracao * 1000).toISOString() : null
  const { error } = await admin.from("billing_charges").update({ pix_code: remote.pixCopiaECola ?? null, expires_at: expiresAt }).eq("id", charge.id)
  if (error) throw new Error("Não foi possível registrar a cobrança Pix")
  return { ...charge, pix_code: remote.pixCopiaECola ?? null, expires_at: expiresAt }
}

export async function settle(agreement: Agreement, externalId: string, amount: string, paidAt: string, periodEnd: string, txid?: string) {
  const { error } = await createAdminClient().rpc("settle_billing_payment", { p_agreement: agreement.id, p_external_id: externalId, p_amount_cents: amountInCents(amount), p_paid_at: paidAt, p_period_end: periodEnd, p_txid: txid ?? null })
  if (error) throw new Error("Falha ao registrar o pagamento confirmado")
}

export async function reconcilePixCharge(charge: Charge, agreement: Agreement) {
  const remote = await efiRequest<PixCharge>(`/v2/${charge.kind === "recurring" ? "cobr" : "cob"}/${encodeURIComponent(charge.txid)}`)
  if (remote.txid !== charge.txid || amountInCents(remote.valor.original) !== agreement.amount_cents) throw new Error("Cobrança Pix divergente")
  for (const received of remote.pix ?? []) {
    if (received.devolucoes?.some((refund) => refund.status === "DEVOLVIDO" && amountInCents(refund.valor) >= agreement.amount_cents)) {
      await reversePayment("efi", received.endToEndId)
    }
  }
  let payment = remote.pix?.find((item) => amountInCents(item.valor) === agreement.amount_cents && !item.devolucoes?.some((refund) => refund.status === "DEVOLVIDO"))
  if (!payment && charge.kind === "recurring") {
    const attempt = remote.tentativas?.find((item) => item.status === "LIQUIDADA" && item.endToEndId)
    if (attempt?.endToEndId) payment = await efiRequest<NonNullable<PixCharge["pix"]>[number]>(`/v2/pix/${encodeURIComponent(attempt.endToEndId)}`)
  }
  if (!payment || amountInCents(payment.valor) !== agreement.amount_cents) return
  const periodEnd = new Date(charge.period_end) <= new Date(payment.horario) ? advanceBillingPeriod(payment.horario, agreement.billing_cycle) : charge.period_end
  await settle(agreement, payment.endToEndId, payment.valor, payment.horario, periodEnd, charge.txid)
}

export async function reconcilePayPal(agreement: Agreement) {
  if (!agreement.external_id) return
  const remote = await paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(agreement.external_id)}`)
  if (remote.custom_id !== agreement.id) throw new Error("Assinatura PayPal divergente")
  const end = new Date()
  const start = new Date(Math.max(new Date(agreement.paid_until || agreement.created_at).getTime() - 3 * 86400000, end.getTime() - 30 * 86400000))
  const transactions = await paypalRequest<{ transactions: { id: string; status: string; time: string; amount_with_breakdown: { gross_amount: { value: string; currency_code: string } } }[] }>(`/v1/billing/subscriptions/${encodeURIComponent(remote.id)}/transactions?start_time=${encodeURIComponent(start.toISOString())}&end_time=${encodeURIComponent(end.toISOString())}`)
  for (const transaction of transactions.transactions ?? []) {
    const amount = transaction.amount_with_breakdown.gross_amount
    if (transaction.status === "REFUNDED") { await reversePayment("paypal", transaction.id); continue }
    if (transaction.status !== "COMPLETED" || amount.currency_code !== "BRL" || amountInCents(amount.value) === 0) continue
    await settle(agreement, transaction.id, amount.value, transaction.time, advanceBillingPeriod(transaction.time, agreement.billing_cycle))
  }
  if (["CANCELLED", "EXPIRED"].includes(remote.status)) await markCanceled(agreement)
}

async function reversePayment(provider: "paypal" | "efi", externalId: string) {
  const { error } = await createAdminClient().rpc("reverse_billing_payment", { p_provider: provider, p_external_id: externalId })
  if (error) throw new Error("Falha ao conciliar pagamento devolvido")
}

async function markCanceled(agreement: Agreement) {
  await updateAgreement(agreement.id, { status: "canceled" })
  const { error } = await createAdminClient().from("subscriptions").update({ cancel_at_period_end: true }).eq("organization_id", agreement.organization_id).eq("billing_agreement_id", agreement.id)
  if (error) throw new Error("Não foi possível registrar o cancelamento")
}

export async function cancelAgreement(agreement: Agreement) {
  if (agreement.provider === "paypal" && agreement.external_id) {
    const remote = await paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(agreement.external_id)}`)
    if (!["CANCELLED", "EXPIRED"].includes(remote.status)) await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(agreement.external_id)}/cancel`, "POST", { reason: "Cancelamento solicitado pelo titular" }, `cancel-${agreement.id}`)
  }
  if (agreement.provider === "efi") {
    if (agreement.setup_stage === "creating_recurrence" && !agreement.external_id) throw new Error("A administração precisa conferir a autorização Pix em preparação antes de cancelar")
    if (agreement.external_id) {
      const remote = await efiRequest<PixRecurrence>(`/v2/rec/${encodeURIComponent(agreement.external_id)}`)
      if (!["CANCELADA", "REJEITADA", "EXPIRADA"].includes(remote.status)) await efiRequest(`/v2/rec/${encodeURIComponent(agreement.external_id)}`, "PATCH", { status: "CANCELADA" })
    }
    const admin = createAdminClient()
    const { data: pending } = await admin.from("billing_charges").select("*").eq("agreement_id", agreement.id).eq("status", "pending")
    for (const charge of (pending ?? []) as Charge[]) {
      await reconcilePixCharge(charge, agreement)
      const { data: current } = await admin.from("billing_charges").select("status").eq("id", charge.id).single()
      if (current?.status === "paid") continue
      const path = `/v2/${charge.kind === "recurring" ? "cobr" : "cob"}/${charge.txid}`
      await efiRequest(path, "PATCH", { status: charge.kind === "recurring" ? "CANCELADA" : "REMOVIDA_PELO_USUARIO_RECEBEDOR" })
      const { error } = await admin.from("billing_charges").update({ status: "canceled" }).eq("id", charge.id)
      if (error) throw new Error("Não foi possível atualizar a cobrança cancelada")
    }
  }
  await markCanceled(agreement)
}
