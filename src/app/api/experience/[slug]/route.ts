import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const admin = createAdminClient()

  const { data: project, error } = await admin
    .from("projects")
    .select("*, scenes(*, scene_objects(*, scene_buttons(*))), project_markers(*), assets(*)")
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
    .select("status")
    .eq("organization_id", project.organization_id)
    .single()

  if (!subscription || subscription.status === "canceled") {
    return NextResponse.json({ error: "Projeto não disponível" }, { status: 404 })
  }

  await admin.rpc("increment_project_views", { p_project_id: project.id })

  const scene = project.scenes?.[0] || null
  const objects = scene?.scene_objects || []
  const marker = project.project_markers?.[0] || null

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      type: project.type,
      thumbnailUrl: project.thumbnail_url,
      marker: marker
        ? {
            imageUrl: marker.image_url,
            targetUrl: marker.target_url || null,
          }
        : null,
      scene: scene
        ? {
            id: scene.id,
            name: scene.name,
            backgroundColor: scene.background_color,
            objects: objects.map((obj: any) => ({
              id: obj.id,
              type: obj.type,
              name: obj.name,
              position: [obj.position_x, obj.position_y, obj.position_z] as [number, number, number],
              rotation: [obj.rotation_x, obj.rotation_y, obj.rotation_z] as [number, number, number],
              scale: [obj.scale_x, obj.scale_y, obj.scale_z] as [number, number, number],
              opacity: obj.opacity,
              visible: obj.visible,
              animationType: obj.animation_type || null,
              action: obj.action || null,
              assetUrl: obj.asset_url || null,
              assetThumbnail: obj.asset_thumbnail || null,
              showCaption: obj.show_caption || null,
              chromaKeyColor: obj.chroma_key_color || null,
              chromaKeyTolerance: obj.chroma_key_tolerance || null,
              chromaKeySmoothness: obj.chroma_key_smoothness || null,
              duration: obj.duration || null,
              buttons: (obj.scene_buttons || []).map((btn: any) => ({
                id: btn.id,
                label: btn.label,
                icon: btn.icon,
                actionType: btn.action_type,
                actionValue: btn.action_value,
              })),
            })),
          }
        : null,
    },
  })
}
