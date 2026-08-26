import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { systemSettingsSchema } from "@/lib/schemas"

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

  let { data, error } = await admin
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle()

  if (error || !data) {
    data = {
      id: 1,
      branding: {
        site_name: "CortexAR",
        logo_url: null,
        favicon_url: null,
        primary_color: "#6366f1",
        secondary_color: "#8b5cf6",
        accent_color: "#06b6d4",
        og_image_url: null,
        footer_text: null,
        meta_title: null,
        meta_description: null,
      },
      asaas: {
        environment: "debug",
        debug_api_key_configured: false,
        production_api_key_configured: false,
      },
      stripe: {
        environment: "debug",
        debug_secret_key_configured: false,
        production_secret_key_configured: false,
      },
      general: {
        allow_signups: true,
        maintenance_mode: false,
        maintenance_message: null,
        default_plan_id: null,
        trial_days: 7,
      },
      evolution: {
        enabled: false,
        server_url: null,
        api_key: null,
        instance_name: null,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: null,
    }
  }

  return NextResponse.json(data)
}

export async function PUT(request: Request) {
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

  const body = await request.json()
  const parsed = systemSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { branding, asaas, general, evolution, stripe } = parsed.data

  const updateData: Record<string, any> = {}
  if (branding) updateData.branding = branding
  if (general) updateData.general = general
  if (evolution) {
    const current = await admin.from("system_settings").select("evolution").eq("id", 1).single()
    const currentEvolution = (current.data?.evolution as Record<string, any>) || {}

    const merged: Record<string, any> = { ...currentEvolution }

    for (const [k, v] of Object.entries(evolution)) {
      if (v !== undefined) {
        merged[k] = v
      }
    }

    updateData.evolution = merged
  }
  if (asaas) {
    const current = await admin.from("system_settings").select("asaas").eq("id", 1).single()
    const currentAsaas = (current.data?.asaas as Record<string, any>) || {}

    const merged: Record<string, any> = { ...currentAsaas }

    for (const [k, v] of Object.entries(asaas)) {
      if (v !== undefined) {
        merged[k] = v
      }
    }

    if (merged.environment) {
      const env = merged.environment
      if (merged[`${env}_api_key`]) {
        merged[`${env}_api_key_configured`] = true
      }
      if (merged[`${env}_webhook_secret`]) {
        merged[`${env}_webhook_secret_configured`] = true
      }
    }

    updateData.asaas = merged
  }

  if (stripe) {
    const current = await admin.from("system_settings").select("stripe").eq("id", 1).single()
    const currentStripe = (current.data?.stripe as Record<string, any>) || {}

    const merged: Record<string, any> = { ...currentStripe }

    for (const [k, v] of Object.entries(stripe)) {
      if (v !== undefined) {
        merged[k] = v
      }
    }

    if (merged.environment) {
      const env = merged.environment
      if (merged[`${env}_secret_key`]) {
        merged[`${env}_secret_key_configured`] = true
      }
    }

    updateData.stripe = merged
  }

  const { data, error } = await admin
    .from("system_settings")
    .upsert({ id: 1, ...updateData })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
