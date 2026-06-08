import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
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

  const { count: orgCount } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug, created_at")

  const { data: subs } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, plan_id")

  const { data: plans } = await admin
    .from("plans")
    .select("id, name, price")

  const { data: members } = await admin
    .from("organization_members")
    .select("organization_id, user_id, role")

  const { count: profileCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })

  return NextResponse.json({
    diagnostics: {
      organizations_count: orgCount,
      profiles_count: profileCount,
      subscriptions_count: subs?.length || 0,
      plans_count: plans?.length || 0,
      members_count: members?.length || 0,
    },
    organizations: orgs || [],
    subscriptions: (subs || []).map((s: any) => ({
      id: s.id,
      org_id: s.organization_id,
      status: s.status,
      plan_id: s.plan_id,
    })),
    plans: plans || [],
    members: members || [],
  })
}
