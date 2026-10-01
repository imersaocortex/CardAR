import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const { data: link, error } = await client.from("affiliate_links").select("id, code, active, created_at").eq("user_id", user.id).maybeSingle()
  if (error) return NextResponse.json({ error: "Programa de indicações indisponível" }, { status: 503 })
  const { count, error: countError } = link ? await client.from("affiliate_referrals").select("id", { count: "exact", head: true }).eq("affiliate_id", link.id) : { count: 0, error: null }
  if (countError) return NextResponse.json({ error: "Não foi possível consultar as indicações" }, { status: 503 })
  const [commissions, payouts] = link ? await Promise.all([
    client.from("affiliate_commissions").select("amount_cents, release_at, payout_id, voided_at").eq("affiliate_id", link.id),
    client.from("affiliate_payouts").select("id, amount_cents, status, requested_at, paid_at").eq("affiliate_id", link.id).order("requested_at", { ascending: false }),
  ]) : [{ data: [], error: null }, { data: [], error: null }]
  if (commissions.error || payouts.error) return NextResponse.json({ error: "Não foi possível consultar as comissões" }, { status: 503 })
  const now = Date.now()
  const balance = { pending: 0, available: 0, requested: 0, paid: 0 }
  for (const payout of payouts.data ?? []) {
    if (payout.status === "paid") balance.paid += Number(payout.amount_cents)
    if (payout.status === "requested") balance.requested += Number(payout.amount_cents)
  }
  for (const commission of commissions.data ?? []) {
    if (commission.voided_at || commission.payout_id) continue
    const bucket = Date.parse(commission.release_at) <= now ? "available" : "pending"
    balance[bucket] += Number(commission.amount_cents)
  }
  return NextResponse.json({ link, signups: count ?? 0, balance, payouts: (payouts.data ?? []).slice(0, 20) })
}

export async function POST(request: Request) {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (body.action === "payout") {
    const key = typeof body.pix_key === "string" ? body.pix_key.trim() : ""
    if (key.length < 5 || key.length > 120) return NextResponse.json({ error: "Informe uma chave Pix válida" }, { status: 400 })
    const { data: link } = await client.from("affiliate_links").select("id").eq("user_id", user.id).eq("active", true).single()
    if (!link) return NextResponse.json({ error: "Link de afiliado não encontrado" }, { status: 404 })
    const { error } = await createAdminClient().rpc("request_affiliate_payout", { p_affiliate: link.id, p_pix_key: key })
    if (error) return NextResponse.json({ error: "Não há comissões liberadas para solicitar o saque" }, { status: 409 })
    return GET()
  }
  if (body.action && body.action !== "create") return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  const admin = createAdminClient()
  const { error } = await admin.from("affiliate_links").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: "Não foi possível gerar seu link" }, { status: 500 })
  return GET()
}
