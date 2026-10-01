import { NextResponse } from "next/server"
export async function POST() {
  return NextResponse.json({ error: "Esta integração foi encerrada. Utilize PayPal ou Efí." }, { status: 410 })
}