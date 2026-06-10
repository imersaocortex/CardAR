import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

function safeDecode(str: string): string {
  try {
    return decodeURIComponent(str.replace(/\+/g, " "))
  } catch {
    return str
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
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

  const { orgId } = await params

  const [orgRes, projectsRes, analyticsRes, paymentsRes] = await Promise.all([
    admin
      .from("organizations")
      .select("*, organization_members(*, profiles(*))")
      .eq("id", orgId)
      .single(),
    admin
      .from("projects")
      .select("id, name, type, status, views, slug, created_at, updated_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    admin
      .from("project_analytics")
      .select("*, project:projects(name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("asaas_payments")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ])

  const { data: subscriptionRaw } = await admin
    .from("subscriptions")
    .select("*, plan:plans(*)")
    .eq("organization_id", orgId)
    .single()

  // Fix plan if returned as array
  const subscription = subscriptionRaw
    ? { ...subscriptionRaw, plan: Array.isArray(subscriptionRaw.plan) ? subscriptionRaw.plan[0] || null : subscriptionRaw.plan }
    : null

  const { data: usage } = await admin
    .from("usage_limits")
    .select("*")
    .eq("organization_id", orgId)
    .single()

  // Aggregate analytics
  const analytics = (analyticsRes.data || []).map((a: any) => ({
    ...a,
    city: a.city ? safeDecode(a.city) : null,
    country: a.country ? safeDecode(a.country) : null,
    region: a.region ? safeDecode(a.region) : null,
  }))
  const totalViews = analytics.filter((a: any) => a.event_type === "view").length
  const totalClicks = analytics.filter((a: any) => a.event_type === "click").length
  const uniqueCountries = new Set(analytics.map((a: any) => a.country).filter(Boolean)).size

  return NextResponse.json({
    organization: orgRes.data || null,
    projects: projectsRes.data || [],
    subscription,
    usage,
    analytics: {
      total_views: totalViews,
      total_clicks: totalClicks,
      total_events: analytics.length,
      unique_countries: uniqueCountries,
      recent_events: analytics.slice(0, 100),
    },
    payments: paymentsRes.data || [],
  })
}
