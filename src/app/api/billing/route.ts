import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createCustomer, createSubscription, cancelSubscription } from "@/lib/asaas"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!memberships) return NextResponse.json({ error: "Sem organização" }, { status: 404 })

  const orgId = memberships.organization_id

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("organization_id", orgId)
    .single()

  const { data: payments } = await supabase
    .from("asaas_payments")
    .select("*")
    .eq("organization_id", orgId)
    .order("due_date", { ascending: false })

  return NextResponse.json({ subscription, payments: payments || [] })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await request.json()
  const { action, plan_id } = body
  const admin = createAdminClient()

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!memberships) return NextResponse.json({ error: "Sem organização" }, { status: 404 })

  const orgId = memberships.organization_id

  if (action === "upgrade") {
    if (!plan_id) return NextResponse.json({ error: "plan_id é obrigatório" }, { status: 400 })

    const { data: plan } = await admin.from("plans").select("*").eq("id", plan_id).single()
    if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 })

    // Check if ASAAS is configured
    if (process.env.ASAAS_API_KEY) {
      // Get or create ASAAS customer
      let asaasCustomerId: string
      const { data: existingCustomer } = await admin
        .from("asaas_customers")
        .select("asaas_customer_id")
        .eq("organization_id", orgId)
        .single()

      if (existingCustomer) {
        asaasCustomerId = existingCustomer.asaas_customer_id
      } else {
        asaasCustomerId = await createCustomer(orgId, user.email || orgId, user.email!)
        await admin.from("asaas_customers").insert({
          organization_id: orgId,
          asaas_customer_id: asaasCustomerId,
        })
      }

      // Cancel old subscription if exists
      const { data: currentSub } = await admin
        .from("subscriptions")
        .select("asaas_subscription_id")
        .eq("organization_id", orgId)
        .single()

      if (currentSub?.asaas_subscription_id) {
        try { await cancelSubscription(currentSub.asaas_subscription_id) } catch {}
      }

      // Create new subscription at ASAAS
      const asaasSub = await createSubscription(asaasCustomerId, plan.price)

      // Update local subscription
      await admin
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          asaas_subscription_id: asaasSub.id,
          status: "active",
        })
        .eq("organization_id", orgId)

      // Update usage limits
      await admin
        .from("usage_limits")
        .update({
          projects_limit: plan.projects_limit,
          assets_limit_bytes: plan.assets_limit_bytes,
        })
        .eq("organization_id", orgId)
    } else {
      // No ASAAS — just update locally (sandbox mode)
      await admin
        .from("subscriptions")
        .update({ plan_id: plan.id, status: "active" })
        .eq("organization_id", orgId)

      await admin
        .from("usage_limits")
        .update({
          projects_limit: plan.projects_limit,
          assets_limit_bytes: plan.assets_limit_bytes,
        })
        .eq("organization_id", orgId)
    }

    return NextResponse.json({ success: true })
  }

  if (action === "cancel") {
    const { data: currentSub } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id")
      .eq("organization_id", orgId)
      .single()

    if (currentSub?.asaas_subscription_id) {
      try { await cancelSubscription(currentSub.asaas_subscription_id) } catch {}
    }

    const { data: starterPlan } = await admin
      .from("plans")
      .select("id, projects_limit, assets_limit_bytes")
      .eq("slug", "starter")
      .single()

    if (starterPlan) {
      await admin
        .from("subscriptions")
        .update({
          plan_id: starterPlan.id,
          asaas_subscription_id: null,
          status: "canceled",
        })
        .eq("organization_id", orgId)

      await admin
        .from("usage_limits")
        .update({
          projects_limit: starterPlan.projects_limit,
          assets_limit_bytes: starterPlan.assets_limit_bytes,
        })
        .eq("organization_id", orgId)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
