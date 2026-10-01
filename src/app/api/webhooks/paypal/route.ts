import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyPayPalWebhook } from "@/lib/payments/paypal"
import { reconcilePayPal, type Agreement } from "@/lib/payments/service"

export async function POST(request: Request) {
  try {
    const event = await request.json()
    if (!await verifyPayPalWebhook(request.headers, event)) return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 })
    const resource = event.resource
    const id = event.event_type?.startsWith("BILLING.SUBSCRIPTION.") ? resource?.id : resource?.billing_agreement_id
    if (typeof id !== "string") return NextResponse.json({ received: true })
    const { data, error } = await createAdminClient().from("billing_agreements").select("*").eq("provider", "paypal").eq("external_id", id).maybeSingle()
    if (error || !data) return NextResponse.json({ error: "Assinatura ainda não registrada" }, { status: 503 })
    // Re-fetch the current provider state; repeated and out-of-order deliveries are safe.
    await reconcilePayPal(data as Agreement)
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível processar a notificação" }, { status: 503 })
  }
}
