import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search") || ""

  // Query organizations with members
  let orgQuery = admin
    .from("organizations")
    .select(`
      *,
      organization_members(
        *,
        profiles(id, name, email, avatar_url, role, created_at)
      )
    `)
    .limit(100)
    .order("created_at", { ascending: false })

  if (search) {
    orgQuery = orgQuery.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
  }

  const { data: orgs, error } = await orgQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orgList = Array.isArray(orgs) ? orgs : []

  // Fetch subscriptions and usage_limits separately (avoid embedding issues)
  const orgIds = orgList.map((o: any) => o.id)

  let subscriptions: any[] = []
  let usageLimits: any[] = []
  let projectCounts: any[] = []

  if (orgIds.length > 0) {
    const [subsRes, usageRes, projRes] = await Promise.all([
      admin.from("subscriptions").select("*, plan:plans(id, name, slug, price)").in("organization_id", orgIds),
      admin.from("usage_limits").select("*").in("organization_id", orgIds),
      admin.from("projects").select("organization_id").in("organization_id", orgIds),
    ])
    subscriptions = (subsRes.data || []) as any[]
    usageLimits = (usageRes.data || []) as any[]
    projectCounts = (projRes.data || []) as any[]
  }

  // Build lookup maps
  const subMap: Record<string, any> = {}
  for (const s of subscriptions) {
    if (s.plan && Array.isArray(s.plan)) s.plan = s.plan[0] || null
    subMap[s.organization_id] = s
  }

  const usageMap: Record<string, any> = {}
  for (const u of usageLimits) {
    usageMap[u.organization_id] = u
  }

  const projectCountMap: Record<string, number> = {}
  for (const p of projectCounts) {
    projectCountMap[p.organization_id] = (projectCountMap[p.organization_id] || 0) + 1
  }

  const result = orgList.map((org: any) => ({
    ...org,
    subscription: subMap[org.id] || null,
    usage_limits: usageMap[org.id] || null,
    projects_count: projectCountMap[org.id] || 0,
  }))

  return NextResponse.json(result)
}
