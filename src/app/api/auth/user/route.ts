import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ user: null })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name, slug)")
    .eq("user_id", user.id)

  const { data: subscription } = memberships?.[0]
    ? await supabase
        .from("subscriptions")
        .select("*, plans(name, slug)")
        .eq("organization_id", memberships[0].organization_id)
        .single()
    : { data: null }

  return NextResponse.json({
    user,
    profile,
    memberships,
    subscription,
  })
}
