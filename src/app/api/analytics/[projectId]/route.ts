import { NextRequest, NextResponse } from "next/server"
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
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { projectId } = await params

  const admin = createAdminClient()

  // Check user has access to this project
  const { data: project } = await admin
    .from("projects")
    .select("id, organization_id, name")
    .eq("id", projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })
  }

  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", project.organization_id)
    .eq("user_id", user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  // Summary stats
  const { count: totalViews } = await admin
    .from("project_analytics")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("event_type", "view")

  const { count: totalClicks } = await admin
    .from("project_analytics")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("event_type", "click")

  const { count: totalInteractions } = await admin
    .from("project_analytics")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("event_type", "view")

  // Unique sessions
  const { data: sessions } = await admin
    .from("project_analytics")
    .select("session_id")
    .eq("project_id", projectId)
    .not("session_id", "is", null)

  const uniqueSessions = new Set((sessions || []).map((s: any) => s.session_id)).size

  // Country breakdown
  const { data: countries } = await admin
    .from("project_analytics")
    .select("country")
    .eq("project_id", projectId)
    .not("country", "is", null)

  const countryMap: Record<string, number> = {}
  for (const row of countries || []) {
    const c = safeDecode(row.country)
    countryMap[c] = (countryMap[c] || 0) + 1
  }
  const countryBreakdown = Object.entries(countryMap)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)

  // City breakdown
  const { data: cities } = await admin
    .from("project_analytics")
    .select("city")
    .eq("project_id", projectId)
    .not("city", "is", null)

  const cityMap: Record<string, number> = {}
  for (const row of cities || []) {
    const c = safeDecode(row.city)
    cityMap[c] = (cityMap[c] || 0) + 1
  }
  const cityBreakdown = Object.entries(cityMap)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)

  // Views over time (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: viewsTimeline } = await admin
    .from("project_analytics")
    .select("created_at")
    .eq("project_id", projectId)
    .eq("event_type", "view")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: true })

  const viewsByDay: Record<string, number> = {}
  for (const row of viewsTimeline || []) {
    const day = new Date(row.created_at).toISOString().slice(0, 10)
    viewsByDay[day] = (viewsByDay[day] || 0) + 1
  }

  // Event type breakdown
  const { data: eventTypes } = await admin
    .from("project_analytics")
    .select("event_type")
    .eq("project_id", projectId)

  const eventTypeMap: Record<string, number> = {}
  for (const row of eventTypes || []) {
    eventTypeMap[row.event_type] = (eventTypeMap[row.event_type] || 0) + 1
  }

  // Button click metadata
  const { data: buttonClicks } = await admin
    .from("project_analytics")
    .select("metadata")
    .eq("project_id", projectId)
    .eq("event_type", "button_click")

  const buttonClickMap: Record<string, number> = {}
  for (const row of buttonClicks || []) {
    const label = (row.metadata as any)?.button_label || "unknown"
    buttonClickMap[label] = (buttonClickMap[label] || 0) + 1
  }

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    summary: {
      total_views: totalViews || 0,
      total_clicks: totalClicks || 0,
      total_interactions: totalInteractions || 0,
      unique_sessions: uniqueSessions,
    },
    country_breakdown: countryBreakdown,
    city_breakdown: cityBreakdown,
    views_by_day: viewsByDay,
    event_type_breakdown: eventTypeMap,
    button_click_breakdown: buttonClickMap,
  })
}
