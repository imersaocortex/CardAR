import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { syncPayCardFrame } from "@/lib/payments/syncpay"
import { syncPayUuid } from "@/lib/payments/syncpay-rules"

export async function GET(request: Request) {
  const client = await createServerSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const { data: member } = await client.from("organization_members").select("role").eq("user_id", user.id).limit(1).single()
  if (!member || !["owner", "admin"].includes(member.role)) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const url = new URL(request.url)
  const id = url.searchParams.get("plan_id") || ""
  if (!syncPayUuid.test(id)) return NextResponse.json({ error: "Plano inválido" }, { status: 400 })
  try { return NextResponse.json({ url: await syncPayCardFrame(id, url.origin) }, { headers: { "Cache-Control": "no-store" } }) }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }) }
}
