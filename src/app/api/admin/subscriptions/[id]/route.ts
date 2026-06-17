import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureStripeKey, cancelSubscription as stripeCancelSubscription } from "@/lib/stripe"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params
  const body = await request.json()
  const { status, reason } = body

  const validStatuses = ["active", "trialing", "past_due", "canceled", "incomplete"]
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 })
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, plan_id")
    .eq("id", id)
    .single()

  if (!subscription) {
    return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 })
  }

  const oldStatus = subscription.status

  await admin
    .from("subscriptions")
    .update({ status })
    .eq("id", id)

  // Cancel in Stripe if setting to canceled
  if (status === "canceled") {
    const { data: subDetails } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, payment_provider")
      .eq("id", id)
      .single()

    if (subDetails?.payment_provider === "stripe" && subDetails.stripe_subscription_id) {
      await ensureStripeKey(admin)
      try {
        await stripeCancelSubscription(subDetails.stripe_subscription_id)
      } catch (e) {
        console.warn("[admin] Failed to cancel Stripe subscription:", e)
      }
    }
  }

  // Log history
  await admin.from("subscription_status_history").insert({
    subscription_id: id,
    organization_id: subscription.organization_id,
    old_status: oldStatus,
    new_status: status,
    changed_by: user.id,
    reason: reason || null,
  })

  // Suspend or unsuspend projects based on new status
  if (status === "past_due" || status === "canceled") {
    await admin.rpc("suspend_org_projects", {
      p_organization_id: subscription.organization_id,
    })
  } else if (status === "active" || status === "trialing") {
    await admin.rpc("unsuspend_org_projects", {
      p_organization_id: subscription.organization_id,
    })
  }

  // If setting to active or trialing, ensure usage_limits match the plan
  if (status === "active" || status === "trialing") {
    const { data: plan } = await admin
      .from("plans")
      .select("projects_limit, assets_limit_bytes")
      .eq("id", subscription.plan_id)
      .single()

    if (plan) {
      await admin
        .from("usage_limits")
        .update({
          projects_limit: plan.projects_limit,
          assets_limit_bytes: plan.assets_limit_bytes,
        })
        .eq("organization_id", subscription.organization_id)
    }
  }

  return NextResponse.json({ success: true })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("*, plan:plans(*), organization:organizations(name, slug)")
    .eq("id", id)
    .single()

  if (!subscription) {
    return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 })
  }

  const { data: history } = await admin
    .from("subscription_status_history")
    .select("*, profiles:changed_by(name, email)")
    .eq("subscription_id", id)
    .order("created_at", { ascending: false })

  return NextResponse.json({
    subscription,
    history: history || [],
  })
}
