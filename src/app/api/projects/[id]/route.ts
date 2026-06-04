import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: project } = await supabase
    .from("projects")
    .select("*, scenes(*, scene_objects(*, scene_buttons(*)))")
    .eq("id", id)
    .single()

  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })

  return NextResponse.json(project)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const body = await request.json()

  const { error } = await supabase
    .from("projects")
    .update(body)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
