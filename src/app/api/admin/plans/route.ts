import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createPlanSchema } from "@/lib/schemas"

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

  const { data: plans, error } = await admin
    .from("plans")
    .select("*, subscriptions(count)")
    .order("price", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(plans || [])
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createPlanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { data: existing } = await admin
    .from("plans")
    .select("id")
    .eq("slug", parsed.data.slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: "Já existe um plano com este slug" }, { status: 409 })
  }

  const { data, error } = await admin
    .from("plans")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      price: parsed.data.price,
      projects_limit: parsed.data.projects_limit,
      assets_limit_bytes: parsed.data.assets_limit_bytes,
      assets_limit_label: parsed.data.assets_limit_label,
      features: parsed.data.features,
      active: parsed.data.active,
      billing_cycle: parsed.data.billing_cycle,
      trial_days: parsed.data.trial_days,
      has_watermark: parsed.data.has_watermark,
      allowed_media_types: parsed.data.allowed_media_types,
      highlight: parsed.data.highlight ?? false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
