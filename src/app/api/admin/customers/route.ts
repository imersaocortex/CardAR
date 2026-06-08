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

  // Fetch organizations
  let orgQuery = admin
    .from("organizations")
    .select("id, name, slug, created_at")
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
  const orgIds = orgList.map((o: any) => o.id)

  // Fetch members, subscriptions, usage_limits, and profiles separately
  let members: any[] = []
  let subscriptions: any[] = []
  let usageLimits: any[] = []
  let projectCounts: any[] = []
  let allProfiles: any[] = []

  if (orgIds.length > 0) {
    const [membersRes, subsRes, usageRes, projRes] = await Promise.all([
      admin.from("organization_members").select("*").in("organization_id", orgIds),
      admin.from("subscriptions").select("id, organization_id, status, current_period_end, plan_id").in("organization_id", orgIds),
      admin.from("usage_limits").select("*").in("organization_id", orgIds),
      admin.from("projects").select("organization_id").in("organization_id", orgIds),
    ])
    members = (membersRes.data || []) as any[]
    subscriptions = (subsRes.data || []) as any[]
    usageLimits = (usageRes.data || []) as any[]
    projectCounts = (projRes.data || []) as any[]
  }

  // Fetch all profiles referenced by members
  const memberUserIds = [...new Set(members.map((m: any) => m.user_id))]
  if (memberUserIds.length > 0) {
    const { data: pData } = await admin
      .from("profiles")
      .select("id, name, email, avatar_url, role, created_at")
      .in("id", memberUserIds)
    allProfiles = (pData || []) as any[]
  }

  const profileMap: Record<string, any> = {}
  for (const p of allProfiles) {
    profileMap[p.id] = p
  }

  const subMap: Record<string, any> = {}
  for (const s of subscriptions) {
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

  // Build plans map
  const planIds = [...new Set(subscriptions.map((s: any) => s.plan_id).filter(Boolean))]
  const planMap: Record<string, any> = {}
  if (planIds.length > 0) {
    const { data: plans } = await admin.from("plans").select("id, name, slug, price").in("id", planIds)
    for (const p of (plans || []) as any[]) {
      planMap[p.id] = p
    }
  }

  const result = orgList
    .map((org: any) => {
      const orgMembers = members.filter((m: any) => m.organization_id === org.id)
      const sub = subMap[org.id] || null

      return {
        ...org,
        organization_members: orgMembers.map((m: any) => ({
          ...m,
          profiles: profileMap[m.user_id] || null,
        })),
        subscription: sub ? { ...sub, plan: sub.plan_id ? planMap[sub.plan_id] || null : null } : null,
        usage_limits: usageMap[org.id] || null,
        projects_count: projectCountMap[org.id] || 0,
      }
    })
    .filter((org: any) => org.organization_members.length > 0)

  return NextResponse.json(result)
}
