import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: orgs } = await admin
    .from("organizations")
    .select("*, organization_members(*, profiles(*))")
    .order("created_at", { ascending: false })
    .limit(50)

  const { data: projects } = await admin
    .from("projects")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(100)

  const { data: payments } = await admin
    .from("asaas_payments")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(100)

  const { data: users } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  const { data: subs } = await admin
    .from("subscriptions")
    .select("*, organizations(name), plan:plans(id, name, slug, price)")
    .order("created_at", { ascending: false })
    .limit(100)

  const totalViews = (projects || []).reduce((s: number, p: any) => s + (p.views || 0), 0)
  const totalStorage = (projects || []).length * 5

  const { count: publishedCount } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")

  const { count: draftCount } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft")

  const { count: activeSubs } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")

  const { data: recentScenes } = await admin
    .from("scenes")
    .select("id, name, project_id, created_at, projects(name)")
    .order("created_at", { ascending: false })
    .limit(10)

  const { data: systemSettings } = await admin
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle()

  return NextResponse.json({
    organizations: orgs || [],
    projects: projects || [],
    payments: payments || [],
    users: users || [],
    subscriptions: subs || [],
    scenes: recentScenes || [],
    system_settings: systemSettings,
    summary: {
      total_views: totalViews,
      published_projects: publishedCount || 0,
      draft_projects: draftCount || 0,
      active_subscriptions: activeSubs || 0,
      total_storage_mb: totalStorage,
    },
  })
}
