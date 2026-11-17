import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { experienceSliderIds, serializeExperience, type ExperienceProjectRow } from "@/lib/ar/serialize-experience"
import { getExperienceSliders } from "@/lib/sliders/server"
import { experienceAccessGranted } from "@/lib/payments/access"
import { organizationOwnedBySuperAdmin } from "@/lib/payments/platform-admin"
import { planAllowsTrackingMode } from "@/lib/plans/tracking"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    const admin = createAdminClient()

    const { data: project, error } = await admin
      .from("projects")
      .select("*, scenes(*, scene_objects(*, scene_buttons(*))), project_markers(*)")
      .eq("slug", slug)
      .single()

    if (error || !project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })
    }

    if (project.status !== "published") {
      return NextResponse.json({ error: "Projeto não disponível" }, { status: 404 })
    }

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status, plan_id, current_period_end, trial_ends_at")
      .eq("organization_id", project.organization_id)
      .maybeSingle()

    const superAdminOwned = await organizationOwnedBySuperAdmin(admin, project.organization_id)
    if (!experienceAccessGranted(subscription, superAdminOwned)) {
      return NextResponse.json({ error: "Projeto não disponível" }, { status: 404 })
    }

    // Check plan for watermark feature
    let hasWatermark = true
    let trackingPlan: { gps_enabled: boolean; surface_enabled: boolean; sliders_enabled: boolean } | null = null
    if (subscription?.plan_id) {
      const { data: plan } = await admin
        .from("plans")
        .select("has_watermark, gps_enabled, surface_enabled, sliders_enabled")
        .eq("id", subscription.plan_id)
        .single()
      if (plan) {
        trackingPlan = plan
        hasWatermark = plan.has_watermark
      }
    }
    if (superAdminOwned) hasWatermark = false
    if (!superAdminOwned && !planAllowsTrackingMode(trackingPlan, project.tracking_mode || "marker"))
      return NextResponse.json({ error: "Tecnologia indisponível neste plano" }, { status: 404 })

    // Get system name from settings
    const { data: settings } = await admin
      .from("system_settings")
      .select("branding")
      .eq("id", 1)
      .maybeSingle()
    const siteName = (settings?.branding as any)?.site_name || "CortexAR"

    await admin.rpc("increment_project_views", { p_project_id: project.id })

    const row: ExperienceProjectRow = project
    const sliders = superAdminOwned || trackingPlan?.sliders_enabled === true
      ? await getExperienceSliders(admin, project.organization_id, experienceSliderIds([row]))
      : undefined
    return NextResponse.json({
      hasWatermark,
      siteName,
      project: serializeExperience(row, sliders),
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (err: any) {
    console.error("[experience API] Unhandled error:", err?.message || err)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
