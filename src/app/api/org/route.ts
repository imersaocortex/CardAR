import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("*, organizations(*)")
    .eq("user_id", user.id)

  return NextResponse.json(memberships || [])
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient()
  const body = await request.json()

  const { error } = await supabase
    .from("organizations")
    .update({ name: body.name })
    .eq("id", body.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
