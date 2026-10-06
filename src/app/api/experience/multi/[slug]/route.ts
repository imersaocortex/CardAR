import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { serializeExperience, type ExperienceProjectRow } from "@/lib/ar/serialize-experience"
import type { ArExperienceData } from "@/lib/mindar"

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: collection } = await admin.from("experience_collections")
    .select("*").eq("slug", slug).maybeSingle()
  if (!collection) return NextResponse.json({ error: "Experiência não encontrada" }, { status: 404 })
  const { data: subscription } = await admin.from("subscriptions")
    .select("status, trial_ends_at, plans(has_watermark, multi_project_enabled)")
    .eq("organization_id", collection.organization_id).maybeSingle()
  const plan = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans
  const active = subscription?.status === "active" || (subscription?.status === "trialing" &&
    (!subscription.trial_ends_at || new Date(subscription.trial_ends_at) > new Date()))
  if (!active || plan?.multi_project_enabled !== true)
    return NextResponse.json({ error: "Experiência indisponível neste plano" }, { status: 404 })
  const { data: projects, error } = await admin.from("projects")
    .select("*, scenes(*, scene_objects(*, scene_buttons(*))), project_markers(*)")
    .in("id", collection.project_ids).eq("organization_id", collection.organization_id)
    .eq("tracking_mode", collection.tracking_mode).eq("status", "published")
  if (error || !projects || projects.length !== collection.project_ids.length)
    return NextResponse.json({ error: "Um dos projetos está indisponível" }, { status: 404 })
  const byId = new Map<string, ExperienceProjectRow>(projects.map((project: ExperienceProjectRow) => [project.id, project]))
  const experiences: ArExperienceData[] = []
  for (const id of collection.project_ids as string[]) {
    const project = byId.get(id)
    if (!project) return NextResponse.json({ error: "Um dos projetos está indisponível" }, { status: 404 })
    experiences.push(serializeExperience(project))
  }
  if (collection.tracking_mode === "marker" && experiences.some((project) => !project.marker?.imageUrl))
    return NextResponse.json({ error: "Um dos marcadores não possui imagem" }, { status: 409 })
  const { data: settings } = await admin.from("system_settings").select("branding").eq("id", 1).maybeSingle()
  const siteName = (settings?.branding as { site_name?: string } | null)?.site_name || ""
  await Promise.all(projects.map((project: ExperienceProjectRow) => admin.rpc("increment_project_views", { p_project_id: project.id })))
  return NextResponse.json({
    collection: { id: collection.id, name: collection.name, trackingMode: collection.tracking_mode },
    projects: experiences, hasWatermark: plan.has_watermark !== false, siteName,
  }, { headers: { "Cache-Control": "no-store" } })
}
