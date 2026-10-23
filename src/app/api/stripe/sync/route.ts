import { NextResponse } from "next/server"
export async function POST() {
  return NextResponse.json({ error: "Integração antiga encerrada. Utilize Pix Automático Asaas." }, { status: 410 })
}
