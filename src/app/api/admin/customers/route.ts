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

  let query = admin
    .from("organizations")
    .select(`
      *,
      organization_members(
        *,
        profiles(id, name, email, avatar_url, role, created_at)
      ),
      subscription:subscriptions(
        id,
        status,
        current_period_end,
        plan:plans(id, name, slug, price)
      ),
      usage_limits(*)
    `)
    .limit(100)
    .order("created_at", { ascending: false })

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
  }

  const { data: orgs, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orgList = Array.isArray(orgs) ? orgs : []

  const { data: projectCounts } = await admin
    .from("projects")
    .select("organization_id, id")
    .limit(10000)

  const projectMap: Record<string, number> = {}
  if (projectCounts && Array.isArray(projectCounts)) {
    for (const p of projectCounts) {
      projectMap[p.organization_id] = (projectMap[p.organization_id] || 0) + 1
    }
  }

  const result = orgList.map((org: any) => ({
    ...org,
    subscription: Array.isArray(org.subscription) ? org.subscription[0] || null : org.subscription || null,
    usage_limits: Array.isArray(org.usage_limits) ? org.usage_limits[0] || null : org.usage_limits || null,
    projects_count: projectMap[org.id] || 0,
  }))

  return NextResponse.json(result)
}
