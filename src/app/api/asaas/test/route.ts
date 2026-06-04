import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const apiKey = body.api_key || process.env.ASAAS_API_KEY
  const environment = body.environment || "debug"
  const baseUrl =
    environment === "production"
      ? "https://api.asaas.com/api/v3"
      : "https://sandbox.asaas.com/api/v3"

  if (!apiKey) {
    return NextResponse.json({ error: "ASAAS_API_KEY não configurada" }, { status: 400 })
  }

  try {
    const res = await fetch(`${baseUrl}/customers`, {
      headers: {
        "Content-Type": "application/json",
        access_token: apiKey,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `ASAAS error ${res.status}: ${text}` }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: "Conexão estabelecida com ASAAS" })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
