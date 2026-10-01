import { NextRequest, NextResponse } from "next/server"
import { sendWelcomeNotification } from "@/lib/evolution"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { organizationId, userName } = await request.json()

    if (!organizationId || !userName) {
      return NextResponse.json({ error: "organizationId and userName required" }, { status: 400 })
    }

    const { data: member } = await supabase.from("organization_members").select("organization_id")
      .eq("organization_id", organizationId).eq("user_id", user.id).eq("role", "owner").maybeSingle()
    if (!member) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single()
    const sent = await sendWelcomeNotification(organizationId, profile?.name || "Cliente")

    return NextResponse.json({ success: true, sent })
  } catch (err: any) {
    console.error("[notifications/welcome] Error:", err)
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 })
  }
}
