import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId")

  if (!projectId) {
    return NextResponse.json({ error: "projectId é obrigatório" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from("scenes")
    .select("*, scene_objects(*, scene_buttons(*))")
    .eq("project_id", projectId)
    .order("created_at")

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from("scenes")
    .insert({
      project_id: body.project_id,
      name: body.name || "Cena Principal",
      background_color: body.background_color || "#000000",
      lighting_config: body.lighting_config || {},
      camera_config: body.camera_config || {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(data)
}
