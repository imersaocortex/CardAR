import "server-only"
import { isIP } from "node:net"
import { createAdminClient } from "@/lib/supabase/admin"
import { amountInCents } from "./money"
import { billingAvailability } from "./settings"
import { syncPayRequest, SyncPayApiError } from "./syncpay-api"
import { syncPayUuid, syncPayIdentity, syncPayPhone, validateSyncPayPlan, validateSyncPaySubscription, syncPayChargeSettlement,
  type SyncPayMethod, type SyncPayPlan, type SyncPaySubscription } from "./syncpay-rules"
import type { Agreement } from "./service"

export interface SyncPayAgreement extends Agreement {
  syncpay_method: SyncPayMethod; syncpay_plan_token: string; syncpay_identity: string
}
const daysFor = (agreement: { billing_cycle: string }) => agreement.billing_cycle === "yearly" ? 365 : 30
async function updateAgreement(id: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from("billing_agreements").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error("Não foi possível salvar a assinatura Sync Pay")
}
export async function verifySyncPayPlanLink(planId: string, method: SyncPayMethod, token: string) {
  const { data: plan } = await createAdminClient().from("plans").select("price, billing_cycle").eq("id", planId).single()
  if (!plan || !syncPayUuid.test(token)) throw new Error("Plano inválido")
  const remote = await syncPayRequest<{ data: SyncPayPlan }>(`/subscription-plans/${token}`)
  validateSyncPayPlan(remote.data, { token, method, amount_cents: amountInCents(plan.price), days: daysFor(plan) })
  if (method === "credit_card" && (amountInCents(plan.price) < 100 || amountInCents(plan.price) > 1_000_000)) throw new Error("Cartão Sync Pay aceita ciclos entre R$ 1,00 e R$ 10.000,00")
  return remote.data
}
export async function syncPayCardFrame(planId: string, origin: string) {
  const available = await billingAvailability()
  if (!available.syncpay.card_configured || origin !== new URL(process.env.APP_URL!).origin) throw new Error("Cartão Sync Pay indisponível nesta origem")
  const { data: plan } = await createAdminClient().from("plans").select("price").eq("id", planId).eq("active", true).single()
  if (!plan || amountInCents(plan.price) < 100 || amountInCents(plan.price) > 1_000_000) throw new Error("Valor fora dos limites para cartão Sync Pay")
  const { data: link } = await createAdminClient().from("syncpay_plan_links").select("external_token").eq("plan_id", planId).eq("method", "credit_card").maybeSingle()
  if (!link) throw new Error("Este plano ainda não tem cartão Sync Pay configurado")
  await verifySyncPayPlanLink(planId, "credit_card", link.external_token)
  const url = new URL(`https://app.syncpayments.com.br/embed/${encodeURIComponent(process.env.SYNC_PAY_PUBLIC_KEY!)}`)
  url.searchParams.set("amount", String(amountInCents(plan.price)))
  url.searchParams.set("parent_origin", origin)
  return url.toString()
}
export async function startSyncPayAgreement(orgId: string, userId: string, planId: string, method: SyncPayMethod, cardToken?: string, customerIp?: string) {
  const available = await billingAvailability()
  if (!(method === "credit_card" ? available.syncpay.card_configured : available.syncpay.pix_configured)) throw new Error("Modalidade Sync Pay indisponível")
  const admin = createAdminClient()
  const [{ data: plan }, { data: subscription }, { data: profile }, linkResult, openResult] = await Promise.all([
    admin.from("plans").select("*").eq("id", planId).eq("active", true).single(),
    admin.from("subscriptions").select("*").eq("organization_id", orgId).single(),
    admin.from("profiles").select("name, email, cpf_cnpj, phone").eq("id", userId).single(),
    admin.from("syncpay_plan_links").select("external_token").eq("plan_id", planId).eq("method", method).maybeSingle(),
    admin.from("billing_agreements").select("*").eq("organization_id", orgId).neq("status", "canceled").maybeSingle(),
  ])
  if (!plan || plan.price <= 0 || !["monthly", "yearly"].includes(plan.billing_cycle || "monthly") || !subscription) throw new Error("Plano ou assinatura indisponível")
  if (subscription.asaas_subscription_id || subscription.stripe_subscription_id) throw new Error("Encerre a assinatura antiga antes de trocar de provedor")
  if (openResult.error || linkResult.error) throw new Error("Não foi possível consultar a contratação")
  if (!linkResult.data) throw new Error("Este plano ainda não foi vinculado à modalidade Sync Pay")
  if (openResult.data) {
    const open = openResult.data as SyncPayAgreement
    if (open.provider !== "syncpay" || open.plan_id !== planId || open.syncpay_method !== method) throw new Error("Há outra assinatura em andamento. Encerre-a antes de trocar de plano ou modalidade.")
    if (open.external_id) { await reconcileSyncPayAgreement(open); return open }
    throw new Error("Adesão em preparação ou aguardando conferência administrativa. Não repita a cobrança.")
  }
  if (subscription.status === "active" && subscription.current_period_end && Date.parse(subscription.current_period_end) > Date.now()) throw new Error("O período atual já está pago. Aguarde o vencimento antes de contratar novamente.")
  const document = (profile?.cpf_cnpj || "").replace(/\D/g, "")
  const phone = syncPayPhone(profile?.phone)
  if (!profile?.name || !profile.email || ![11, 14].includes(document.length) || (method === "credit_card" && ![10, 11].includes(phone.length))) throw new Error("Preencha nome, e-mail, CPF/CNPJ e telefone com DDD no perfil")
  if (method === "credit_card" && (!cardToken || !/^card_token\.[A-Za-z0-9_\-\.]+$/.test(cardToken))) throw new Error("Preencha o cartão no formulário seguro da Sync Pay")
  if (method === "credit_card" && (!customerIp || !isIP(customerIp))) throw new Error("Não foi possível identificar a conexão para a análise segura do cartão. Atualize a página e tente novamente.")
  await verifySyncPayPlanLink(planId, method, linkResult.data.external_token)
  // Persist one attempt and use its ID as the provider's documented idempotency
  // key. Still recover ambiguous responses administratively; never auto-retry.
  const { data, error } = await admin.from("billing_agreements").insert({
    organization_id: orgId, created_by: userId, plan_id: planId, provider: "syncpay",
    pix_mode: method === "pix_automatico" ? "automatic" : null,
    amount_cents: amountInCents(plan.price), billing_cycle: plan.billing_cycle || "monthly",
    setup_stage: "enrolling", syncpay_consent_at: new Date().toISOString(), syncpay_method: method, syncpay_plan_token: linkResult.data.external_token,
    syncpay_identity: syncPayIdentity(profile.email, document),
  }).select().single()
  if (error || !data) throw new Error("Outra adesão pode estar em andamento. Atualize a página.")
  const agreement = data as SyncPayAgreement
  let enrolled: { subscription_token: string; billing_method: string; payment?: { qr_code?: string; status?: string } }
  try { enrolled = await syncPayRequest<typeof enrolled>(
    `/subscription-plans/${agreement.syncpay_plan_token}/enroll`, "POST", {
      name: profile.name, email: profile.email, document, billing_method: method, ...(phone ? { phone } : {}),
      ...(method === "credit_card" ? { card: { token: cardToken }, ...(customerIp ? { customer_ip: customerIp } : {}) } : {}),
    }, { idempotencyKey: agreement.id }) } catch (error) {
    // A documented rejection means no enrollment exists; an ambiguous response stays locked.
    if (error instanceof SyncPayApiError && [400, 401, 403, 404, 422, 429].includes(error.status))
      await updateAgreement(agreement.id, { status: "canceled", setup_stage: "rejected" })
    throw error
  }
  if (!syncPayUuid.test(enrolled.subscription_token) || enrolled.billing_method !== method) throw new Error("Resposta Sync Pay exige conferência administrativa; não repita a adesão")
  const pix = method === "pix_automatico" && enrolled.payment?.qr_code?.startsWith("000201") ? enrolled.payment.qr_code : null
  await updateAgreement(agreement.id, { external_id: enrolled.subscription_token, setup_stage: "ready", pix_code: pix })
  const fresh = { ...agreement, external_id: enrolled.subscription_token, setup_stage: "ready", pix_code: pix }
  await reconcileSyncPayAgreement(fresh)
  return fresh
}
export async function reconcileSyncPayAgreement(agreement: SyncPayAgreement) {
  if (agreement.provider !== "syncpay" || !agreement.external_id || !syncPayUuid.test(agreement.external_id)) throw new Error("Adesão Sync Pay aguarda conferência administrativa")
  const remote = (await syncPayRequest<{ data: SyncPaySubscription }>(`/subscriptions/${agreement.external_id}`)).data
  validateSyncPaySubscription(remote, { token: agreement.external_id, plan_token: agreement.syncpay_plan_token, amount_cents: agreement.amount_cents,
    method: agreement.syncpay_method, days: daysFor(agreement), identity: agreement.syncpay_identity })
  const admin = createAdminClient()
  const cycles = new Set<number>()
  for (const charge of [...(remote.charges || [])].sort((a, b) => a.cycle_number - b.cycle_number)) {
    if (cycles.has(charge.cycle_number)) throw new Error("Ciclo Sync Pay duplicado; confira a assinatura no provedor")
    cycles.add(charge.cycle_number)
    const settlement = syncPayChargeSettlement(charge, remote.started_at, daysFor(agreement), agreement.amount_cents)
    const external = `${agreement.external_id}:${charge.cycle_number}`
    const invoice = { provider: "syncpay", external_id: external, agreement_id: agreement.id, organization_id: agreement.organization_id,
      amount_cents: agreement.amount_cents, due_date: charge.due_date, status: charge.status,
      pix_code: null, qr_expires_at: charge.expires_at || null, updated_at: new Date().toISOString() }
    if (settlement) {
      const { error } = await admin.rpc("settle_billing_payment", { p_agreement: agreement.id, p_external_id: external,
        p_amount_cents: agreement.amount_cents, p_paid_at: settlement.paidAt, p_period_end: settlement.periodEnd, p_txid: null })
      if (error) throw new Error("Não foi possível liquidar o ciclo Sync Pay")
    } else if (["refunded", "med", "charged_back", "chargeback"].includes(charge.status)) {
      const { error } = await admin.rpc("reverse_billing_payment", { p_provider: "syncpay", p_external_id: external })
      if (error) throw new Error("Não foi possível reverter o ciclo Sync Pay")
    }
    const { error } = await admin.from("billing_invoices").upsert(invoice, { onConflict: "provider,external_id" })
    if (error) throw new Error("Não foi possível registrar a fatura Sync Pay")
  }
  if (remote.status === "cancelled") {
    await updateAgreement(agreement.id, { status: "canceled", pix_code: null })
    const { error } = await admin.from("subscriptions").update({ cancel_at_period_end: true }).eq("billing_agreement_id", agreement.id)
    if (error) throw new Error("Não foi possível registrar o cancelamento Sync Pay")
  } else if (remote.started_at) await updateAgreement(agreement.id, { pix_code: null })
}
export async function cancelSyncPayAgreement(agreement: SyncPayAgreement) {
  if (!agreement.external_id) throw new Error("Adesão em conferência: confirme no provedor antes de cancelar")
  await reconcileSyncPayAgreement(agreement)
  const remote = (await syncPayRequest<{ data: SyncPaySubscription }>(`/subscriptions/${agreement.external_id}`)).data
  if (remote.status !== "cancelled") await syncPayRequest(`/subscriptions/${agreement.external_id}/cancel`, "PATCH", { reason: "Solicitado pelo responsável da organização na plataforma" })
  // Read back cancellation; a successful HTTP alone does not mutate financial state.
  await reconcileSyncPayAgreement(agreement)
}
export async function recoverSyncPayAgreement(id: string, token: string) {
  const admin = createAdminClient()
  const { data } = await admin.from("billing_agreements").select("*").eq("id", id).eq("provider", "syncpay").is("external_id", null).eq("setup_stage", "enrolling").single()
  if (!data || !syncPayUuid.test(token)) throw new Error("Adesão para recuperação não encontrada")
  const agreement = data as SyncPayAgreement
  const remote = (await syncPayRequest<{ data: SyncPaySubscription }>(`/subscriptions/${token}`)).data
  validateSyncPaySubscription(remote, { token, plan_token: agreement.syncpay_plan_token, amount_cents: agreement.amount_cents,
    method: agreement.syncpay_method, days: daysFor(agreement), identity: agreement.syncpay_identity })
  const { error } = await admin.from("billing_agreements").update({ external_id: token, setup_stage: "ready" }).eq("id", id).is("external_id", null)
  if (error) throw new Error("Não foi possível recuperar a adesão")
  await reconcileSyncPayAgreement({ ...agreement, external_id: token })
}
export async function processSyncPayEvents() {
  const admin = createAdminClient()
  const { data, error } = await admin.from("syncpay_events").select("id, subscription_token").is("processed_at", null).order("created_at").limit(30)
  if (error) throw new Error("Fila Sync Pay indisponível")
  let failed = false
  for (const event of data || []) {
    try {
      const { data: agreement, error: lookup } = await admin.from("billing_agreements").select("*").eq("provider", "syncpay").eq("external_id", event.subscription_token).maybeSingle()
      if (lookup || !agreement) throw new Error("Adesão ainda não vinculada; confira a recuperação administrativa")
      await reconcileSyncPayAgreement(agreement as SyncPayAgreement)
      const { error } = await admin.from("syncpay_events").update({ processed_at: new Date().toISOString(), last_error: null }).eq("id", event.id)
      if (error) throw error
    } catch {
      failed = true
      await admin.from("syncpay_events").update({ last_error: "Conciliação pendente; confira a assinatura, o vínculo e as credenciais na Sync Pay" }).eq("id", event.id)
    }
  }
  if (failed) throw new Error("Há notificações Sync Pay aguardando conciliação")
}
