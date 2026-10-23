import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { reconcileAsaasAgreement, reconcileAsaasPayment, type Agreement } from "@/lib/payments/service"
import { asaasRequest, type AsaasAuthorization } from "@/lib/payments/asaas"

function authenticated(value: string | null) {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN
  return !!secret && !!value && Buffer.byteLength(secret) === Buffer.byteLength(value) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(value))
}

export async function POST(request: Request) {
  if (!authenticated(request.headers.get("asaas-access-token"))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (Number(request.headers.get("content-length")) > 1_000_000) return NextResponse.json({ error: "Payload excede o limite" }, { status: 413 })
  try {
    const raw = await request.text()
    if (raw.length > 1_000_000) return NextResponse.json({ error: "Payload excede o limite" }, { status: 413 })
    const event = JSON.parse(raw) as { id?: string; event?: string; authorization?: { id?: string; contractId?: string }; paymentInstruction?: { authorization?: { id?: string } }; payment?: { id?: string } }
    if (!event.id || !event.event) return NextResponse.json({ error: "Evento inválido" }, { status: 400 })
    const authId = event.authorization?.id || event.paymentInstruction?.authorization?.id
    if (authId && /^PIX_AUTOMATIC_RECURRING_/.test(event.event)) {
      const admin = createAdminClient()
      const lookup = await admin.from("billing_agreements").select("*")
        .eq("provider", "asaas").eq("external_id", authId).maybeSingle()
      let data = lookup.data
      const error = lookup.error
      if (error) throw error
      const contract = event.authorization?.contractId
      if (!data && contract && /^[0-9a-f]{32}$/i.test(contract)) {
        const uuid = `${contract.slice(0, 8)}-${contract.slice(8, 12)}-${contract.slice(12, 16)}-${contract.slice(16, 20)}-${contract.slice(20)}`
        const candidate = await admin.from("billing_agreements").select("*").eq("id", uuid).eq("provider", "asaas").eq("setup_stage", "creating_authorization").maybeSingle()
        if (candidate.error) throw candidate.error
        if (candidate.data) {
          const remote = await asaasRequest<AsaasAuthorization>(`/pix/automatic/authorizations/${encodeURIComponent(authId)}`)
          if (remote.id !== authId || remote.contractId !== contract || remote.customerId !== candidate.data.asaas_customer_id) throw new Error("Autorização Asaas divergente")
          const saved = await admin.from("billing_agreements").update({ external_id: authId }).eq("id", uuid).is("external_id", null).select("*").maybeSingle()
          if (saved.error) throw saved.error
          data = saved.data
        }
      }
      if (data) await reconcileAsaasAgreement(data as Agreement)
    }
    if (event.payment?.id && event.event.startsWith("PAYMENT_")) {
      // The webhook only signals a change. The API response is authoritative.
      await reconcileAsaasPayment(event.payment.id)
    }
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível conciliar a notificação" }, { status: 503 })
  }
}
