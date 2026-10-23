import { NextResponse } from "next/server"
export async function POST() {
  return NextResponse.json({ error: "Endpoint antigo encerrado. A conciliação é feita pela nova integração Asaas." }, { status: 410 })
}
