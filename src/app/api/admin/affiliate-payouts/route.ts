import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

async function authorize() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single()
  return data?.role === "super_admin" ? user : null
}

export async function GET() {
  if (!await authorize()) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const admin = createAdminClient()
  const [payouts, settings, alerts] = await Promise.all([
    admin.from("affiliate_payouts").select("id, affiliate_id, amount_cents, pix_key, status, requested_at, paid_at, transfer_reference, affiliate_links(user_id)").order("requested_at", { ascending: false }).limit(100),
    admin.from("affiliate_program_settings").select("enabled, rate_bps, fixed_cents, recurring, hold_days").eq("id", 1).single(),
    admin.from("affiliate_refund_alerts").select("id, commission_id, amount_cents, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(100),
  ])
  if (payouts.error || settings.error || alerts.error) return NextResponse.json({ error: "Falha ao carregar repasses" }, { status: 503 })
  const userIds = [...new Set((payouts.data ?? []).map((item) => item.affiliate_links?.[0]?.user_id).filter((id): id is string => !!id))]
  const { data: profiles, error } = userIds.length ? await admin.from("profiles").select("id, name, email").in("id", userIds) : { data: [], error: null }
  if (error) return NextResponse.json({ error: "Falha ao carregar afiliados" }, { status: 503 })
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return NextResponse.json({ payouts: (payouts.data ?? []).map((item) => ({ ...item, profile: item.affiliate_links?.[0]?.user_id ? names.get(item.affiliate_links[0].user_id) : null })), settings: settings.data, refundAlerts: alerts.data ?? [] })
}

const schema = z.object({ id: z.string().uuid(), action: z.enum(["paid", "rejected"]), transfer_reference: z.string().trim().min(5).max(200).optional() })
export async function POST(request: Request) {
  const user = await authorize()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || (parsed.data.action === "paid" && !parsed.data.transfer_reference)) return NextResponse.json({ error: "Informe a ação e o comprovante da transferência Pix" }, { status: 400 })
  const { error } = await createAdminClient().rpc("review_affiliate_payout", {
    p_payout: parsed.data.id,
    p_approve: parsed.data.action === "paid",
    p_reference: parsed.data.transfer_reference ?? null,
    p_reviewer: user.id,
  })
  if (error) return NextResponse.json({ error: "Saque já analisado ou indisponível" }, { status: 409 })
  return NextResponse.json({ success: true })
}
