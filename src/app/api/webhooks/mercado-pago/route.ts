import { NextResponse } from "next/server"
import { reconcileMercadoPagoPayment } from "@/lib/payments/mercado-pago"
import { verifyMercadoPagoSignature } from "@/lib/payments/mercado-pago-signature"

export async function POST(request: Request) {
  const paymentId = new URL(request.url).searchParams.get("data.id") || ""
  if (!verifyMercadoPagoSignature(process.env.MERCADO_PAGO_WEBHOOK_SECRET || "",
    request.headers.get("x-signature") || "", request.headers.get("x-request-id") || "", paymentId))
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (Number(request.headers.get("content-length")) > 100_000) return NextResponse.json({ error: "Payload excede o limite" }, { status: 413 })
  try {
    const raw = await request.text()
    if (raw.length > 100_000) return NextResponse.json({ error: "Payload excede o limite" }, { status: 413 })
    const event = JSON.parse(raw) as { type?: string; data?: { id?: string | number } }
    if (event.type !== "payment" || String(event.data?.id) !== paymentId) return NextResponse.json({ received: true })
    await reconcileMercadoPagoPayment(paymentId)
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível conciliar o pagamento" }, { status: 503 })
  }
}
