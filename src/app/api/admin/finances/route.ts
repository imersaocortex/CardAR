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

  const { data: payments } = await admin
    .from("asaas_payments")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(500)

  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()

  const confirmedPayments = (payments || []).filter(
    (p: any) => p.status === "CONFIRMED" || p.status === "RECEIVED",
  )
  const thisMonthPayments = confirmedPayments.filter(
    (p: any) => p.paid_date >= thisMonth,
  )
  const lastMonthPayments = confirmedPayments.filter(
    (p: any) => p.paid_date >= lastMonth && p.paid_date <= lastMonthEnd,
  )

  const totalRevenue = confirmedPayments.reduce((s: number, p: any) => s + p.value, 0)
  const thisMonthRevenue = thisMonthPayments.reduce((s: number, p: any) => s + p.value, 0)
  const lastMonthRevenue = lastMonthPayments.reduce((s: number, p: any) => s + p.value, 0)

  const revenueChange = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : 0

  const { data: subscriptions } = await admin
    .from("subscriptions")
    .select("*, organizations(name), plan:plans(id, name, price)")
    .eq("status", "active")

  const mrr = (subscriptions || []).reduce((s: number, sub: any) => s + (sub.plan?.price || 0), 0)

  const activeSubs = (subscriptions || []).length
  const { count: totalSubs } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })

  const churned = ((totalSubs || 0) - activeSubs)

  const statusCounts: Record<string, number> = {}
  for (const p of payments || []) {
    const s = (p as any).status
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }

  const { data: pendingCount } = await admin
    .from("asaas_payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING")

  const overduePayments = (payments || []).filter((p: any) => p.status === "OVERDUE")
  const overdueAmount = overduePayments.reduce((s: number, p: any) => s + p.value, 0)

  const { data: topOrgs } = await admin
    .from("projects")
    .select("organization_id, organizations(name)")
    .limit(10000)

  const orgProjectCount: Record<string, { name: string; count: number }> = {}
  for (const p of topOrgs || []) {
    const oid = (p as any).organization_id
    const oname = (p as any).organizations?.name || "Unknown"
    if (!orgProjectCount[oid]) {
      orgProjectCount[oid] = { name: oname, count: 0 }
    }
    orgProjectCount[oid].count++
  }

  const topByProjects = Object.values(orgProjectCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return NextResponse.json({
    summary: {
      total_revenue: totalRevenue,
      this_month_revenue: thisMonthRevenue,
      last_month_revenue: lastMonthRevenue,
      revenue_change_percent: Math.round(revenueChange * 100) / 100,
      mrr,
      active_subscriptions: activeSubs,
      total_subscriptions: totalSubs || 0,
      churned,
      pending_payments: pendingCount || 0,
      overdue_amount: overdueAmount,
      overdue_count: overduePayments.length,
    },
    payments: (payments || []).slice(0, 50),
    payment_status_breakdown: statusCounts,
    top_organizations: topByProjects,
    revenue_by_month: buildMonthlyRevenue(confirmedPayments),
  })
}

function buildMonthlyRevenue(payments: any[]) {
  const monthly: Record<string, number> = {}
  for (const p of payments) {
    if (!p.paid_date) continue
    const key = p.paid_date.substring(0, 7)
    monthly[key] = (monthly[key] || 0) + p.value
  }
  return Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue: Math.round(revenue / 100) }))
}
