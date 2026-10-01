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

  const { data } = await admin
    .from("system_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle()

  const visible = data ? {
    id: data.id,
    branding: data.branding,
    general: data.general,
    evolution: data.evolution,
    created_at: data.created_at,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  } : {
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
  return NextResponse.json(visible)
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

  const { branding, general, evolution } = parsed.data

  const updateData: Record<string, unknown> = {}
  if (branding) updateData.branding = branding
  if (general) updateData.general = general
  if (evolution) {
    const current = await admin.from("system_settings").select("evolution").eq("id", 1).single()
    const currentEvolution = (current.data?.evolution as Record<string, unknown>) || {}

    const merged: Record<string, unknown> = { ...currentEvolution }

    for (const [k, v] of Object.entries(evolution)) {
      if (v !== undefined) {
        merged[k] = v
      }
    }

    updateData.evolution = merged
  }
  const { data, error } = await admin
    .from("system_settings")
    .upsert({ id: 1, ...updateData })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, branding: data.branding, general: data.general, evolution: data.evolution, created_at: data.created_at, updated_at: data.updated_at, updated_by: data.updated_by })
}
