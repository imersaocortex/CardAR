import { NextResponse } from "next/server"
export async function POST() {
  return NextResponse.json({ error: "Endpoint antigo encerrado. Gerencie o Pix Automático em Minha assinatura." }, { status: 410 })
}
