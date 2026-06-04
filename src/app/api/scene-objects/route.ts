import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from("scene_objects")
    .insert({
      scene_id: body.scene_id,
      type: body.type,
      name: body.name,
      position_x: body.position_x ?? 0,
      position_y: body.position_y ?? 0,
      position_z: body.position_z ?? 0,
      rotation_x: body.rotation_x ?? 0,
      rotation_y: body.rotation_y ?? 0,
      rotation_z: body.rotation_z ?? 0,
      scale_x: body.scale_x ?? 1,
      scale_y: body.scale_y ?? 1,
      scale_z: body.scale_z ?? 1,
      opacity: body.opacity ?? 1,
      visible: body.visible ?? true,
      layer_order: body.layer_order ?? 0,
      animation_type: body.animation_type ?? null,
      action: body.action ?? null,
      asset_url: body.asset_url ?? null,
      asset_thumbnail: body.asset_thumbnail ?? null,
      show_caption: body.show_caption ?? null,
      chroma_key_color: body.chroma_key_color ?? null,
      chroma_key_tolerance: body.chroma_key_tolerance ?? null,
      chroma_key_smoothness: body.chroma_key_smoothness ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(data)
}
