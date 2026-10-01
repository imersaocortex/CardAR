import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { reconcilePixCharge, type Agreement, type Charge } from "@/lib/payments/service"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const secret = process.env.EFI_WEBHOOK_TOKEN
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(secret), Buffer.from(token))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  try {
    const body = await request.json()
    const entries = Array.isArray(body.pix) ? body.pix : Array.isArray(body.cobr) ? body.cobr : []
    const admin = createAdminClient()
    for (const entry of entries.slice(0, 100)) {
      if (typeof entry.txid !== "string") continue
      const { data: charge, error } = await admin.from("billing_charges").select("*").eq("txid", entry.txid).maybeSingle()
      if (error) throw error
      if (!charge) continue
      const { data: agreement, error: agreementError } = await admin.from("billing_agreements").select("*").eq("id", charge.agreement_id).single()
      if (agreementError || !agreement) throw new Error("Assinatura não encontrada")
      // Never grant access from callback values: verify receipt through mTLS at Efí.
      await reconcilePixCharge(charge as Charge, agreement as Agreement)
    }
    return NextResponse.json({ received: true })
  } catch { return NextResponse.json({ error: "Falha ao verificar o pagamento" }, { status: 503 }) }
}
