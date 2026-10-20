import { NextResponse } from "next/server"
import { billingAvailability } from "@/lib/payments/service"
export async function GET() {
  try { return NextResponse.json(await billingAvailability()) }
  catch { return NextResponse.json({ error: "Configuração de pagamentos indisponível" }, { status: 503 }) }
}
