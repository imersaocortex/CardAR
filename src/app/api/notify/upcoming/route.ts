import { NextResponse } from "next/server"
import { sendBillingNotifications } from "@/lib/payments/notifications"

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  try { return NextResponse.json(await sendBillingNotifications()) }
  catch { return NextResponse.json({ error: "Não foi possível enviar as notificações" }, { status: 503 }) }
}
