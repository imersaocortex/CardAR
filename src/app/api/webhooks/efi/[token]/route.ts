import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { reconcilePixCharge, reconcilePixRecurrence, type Agreement, type Charge } from "@/lib/payments/service"
import { parseEfiWebhookEvents } from "@/lib/payments/efi-events"
import { efiRequest } from "@/lib/payments/efi"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const secret = process.env.EFI_WEBHOOK_TOKEN
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(secret), Buffer.from(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (Number(request.headers.get("content-length")) > 1_000_000) return NextResponse.json({ error: "Payload excede o limite" }, { status: 413 })
  try {
    const body = await request.json()
    const events = parseEfiWebhookEvents(body)
    const admin = createAdminClient()
    for (const endToEndId of events.endToEndIds) {
      const remote = await efiRequest<{ txid?: string }>(`/v2/pix/${encodeURIComponent(endToEndId)}`)
      if (remote.txid && /^[a-zA-Z0-9]{26,35}$/.test(remote.txid)) events.txids.push(remote.txid)
    }
    for (const idRec of events.recurrenceIds) {
      const { data: agreement, error } = await admin.from("billing_agreements").select("*").eq("provider", "efi").eq("external_id", idRec).maybeSingle()
      if (error) throw error
      if (agreement) await reconcilePixRecurrence(agreement as Agreement)
    }
    for (const txid of new Set(events.txids)) {
      const { data: charge, error } = await admin.from("billing_charges").select("*").eq("txid", txid).maybeSingle()
      if (error) throw error
      if (!charge) continue
      const { data: agreement, error: agreementError } = await admin.from("billing_agreements").select("*").eq("id", charge.agreement_id).single()
      if (agreementError || !agreement) throw new Error("Assinatura não encontrada")
      // A callback is only a signal: obtain the authoritative payment through Efí mTLS.
      await reconcilePixCharge(charge as Charge, agreement as Agreement)
    }
    return NextResponse.json({ received: true })
  } catch { return NextResponse.json({ error: "Falha ao verificar o pagamento" }, { status: 503 }) }
}
