import { createHash } from "node:crypto"
import { after, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifySyncPayWebhook, syncPayUuid, syncPayWebhookSecrets } from "@/lib/payments/syncpay-rules"
import { processSyncPayEvents } from "@/lib/payments/syncpay"

export const maxDuration = 60
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 100000) return new Response(null, { status: 413 })
  const raw = await request.text()
  if (raw.length > 100000) return new Response(null, { status: 413 })
  const secrets = syncPayWebhookSecrets(process.env.SYNC_PAY_WEBHOOK_SECRET, process.env.SYNC_PAY_WEBHOOK_SECRETS)
  if (!secrets.some(secret => verifySyncPayWebhook(secret, request.headers.get("authorization"), request.headers.get("x-syncpay-signature"), raw))) return new Response(null, { status: 401 })
  try {
    const body = JSON.parse(raw)
    const token = body.subscription_token || body.subscription?.token
    if (!syncPayUuid.test(token || "") || typeof body.event !== "string" || body.event.length > 100) return NextResponse.json({ ignored: true })
    const id = createHash("sha256").update(raw).digest("hex")
    const { error } = await createAdminClient().from("syncpay_events").upsert({ id, subscription_token: token, event: body.event }, { onConflict: "id", ignoreDuplicates: true })
    if (error) throw error
    after(async () => { try { await processSyncPayEvents() } catch { /* Durable events retry in the renewal cron. */ } })
    return NextResponse.json({ received: true })
  } catch { return NextResponse.json({ error: "Não foi possível registrar o evento" }, { status: 503 }) }
}
