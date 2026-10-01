import { NextResponse } from "next/server"
export async function DELETE() {
  return NextResponse.json({ error: "O histórico financeiro é preservado para auditoria. Cancelamentos devem ser feitos na assinatura." }, { status: 405 })
}