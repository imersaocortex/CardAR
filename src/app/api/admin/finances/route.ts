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

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()

  // Fetch payments
  const { data: payments } = await admin
    .from("asaas_payments")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(500)

  const paymentList = (payments || []) as any[]

  const confirmedPayments = paymentList.filter(
    (p: any) => p.status === "CONFIRMED" || p.status === "RECEIVED",
  )
  const thisMonthPayments = confirmedPayments.filter(
    (p: any) => p.paid_date && p.paid_date >= thisMonthStart,
  )
  const lastMonthPayments = confirmedPayments.filter(
    (p: any) => p.paid_date && p.paid_date >= lastMonthStart && p.paid_date <= lastMonthEnd,
  )

  const totalRevenue = confirmedPayments.reduce((s: number, p: any) => s + p.value, 0)
  const thisMonthRevenue = thisMonthPayments.reduce((s: number, p: any) => s + p.value, 0)
  const lastMonthRevenue = lastMonthPayments.reduce((s: number, p: any) => s + p.value, 0)

  const revenueChange = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : 0

  // Fetch subscriptions separately to avoid embedding issues
  const { data: allSubs } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, plan_id")
    .limit(500)

  const subList = (allSubs || []) as any[]

  // Filter to only include orgs that have at least one member (remove orphans)
  const subOrgIds = [...new Set(subList.map((s: any) => s.organization_id))]
  const { data: validOrgs } = await admin
    .from("organization_members")
    .select("organization_id")
    .in("organization_id", subOrgIds)
  const validOrgIds = new Set((validOrgs || []).map((m: any) => m.organization_id))
  const filteredSubs = subList.filter((s: any) => validOrgIds.has(s.organization_id))

  // Fetch plans
  const { data: allPlans } = await admin
    .from("plans")
    .select("id, name, price")
    .limit(50)

  const planMap: Record<string, any> = {}
  for (const p of (allPlans || []) as any[]) {
    planMap[p.id] = p
  }

  // Get org names
  const orgIds = [...new Set(filteredSubs.map((s: any) => s.organization_id))]
  let orgMap: Record<string, string> = {}
  if (orgIds.length > 0) {
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, name")
      .in("id", orgIds)
    for (const o of (orgs || []) as any[]) {
      orgMap[o.id] = o.name
    }
  }

  const activeSubs = filteredSubs.filter((s: any) => s.status === "active")
  const mrr = activeSubs.reduce((s: number, sub: any) => {
    const plan = planMap[sub.plan_id]
    return s + (plan?.price || 0)
  }, 0)

  const totalSubs = filteredSubs.length
  const churned = filteredSubs.filter((s: any) => s.status === "canceled").length

  const statusCounts: Record<string, number> = {}
  for (const p of paymentList) {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1
  }

  const pendingCount = paymentList.filter((p: any) => p.status === "PENDING").length
  const overduePayments = paymentList.filter((p: any) => p.status === "OVERDUE")
  const overdueAmount = overduePayments.reduce((s: number, p: any) => s + p.value, 0)

  // Top orgs by project count
  const { data: topOrgs } = await admin
    .from("projects")
    .select("organization_id")
    .limit(10000)

  const orgProjectCount: Record<string, { name: string; count: number }> = {}
  for (const p of (topOrgs || []) as any[]) {
    const oid = p.organization_id
    if (!orgProjectCount[oid]) {
      orgProjectCount[oid] = { name: orgMap[oid] || "Unknown", count: 0 }
    }
    orgProjectCount[oid].count++
  }

  const topByProjects = Object.values(orgProjectCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Build subscription list with org names
  const subscriptionsWithOrgs = activeSubs.map((s: any) => ({
    ...s,
    organizations: { name: orgMap[s.organization_id] || "Unknown" },
    plan: planMap[s.plan_id] || null,
  }))

  return NextResponse.json({
    summary: {
      total_revenue: totalRevenue,
      this_month_revenue: thisMonthRevenue,
      last_month_revenue: lastMonthRevenue,
      revenue_change_percent: Math.round(revenueChange * 100) / 100,
      mrr,
      active_subscriptions: activeSubs.length,
      total_subscriptions: totalSubs,
      churned,
      pending_payments: pendingCount,
      overdue_amount: overdueAmount,
      overdue_count: overduePayments.length,
    },
    payments: paymentList.slice(0, 50),
    payment_status_breakdown: statusCounts,
    top_organizations: topByProjects,
    revenue_by_month: buildMonthlyRevenue(confirmedPayments),
    subscriptions: subscriptionsWithOrgs,
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
