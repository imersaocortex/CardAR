import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin
    .from("projects")
    .select("organization_id")
    .eq("id", id)
    .single()
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })

  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", project.organization_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "editor"])
    .single()
  if (!membership) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const formData = await _req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo .mind não enviado" }, { status: 400 })

  if (!file.name.endsWith(".mind")) {
    return NextResponse.json({ error: "Formato inválido. Use .mind" }, { status: 400 })
  }

  const fileName = `target_${id}.mind`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from("markers")
    .upload(fileName, buffer, {
      contentType: "application/octet-stream",
      upsert: true,
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = await admin.storage
    .from("markers")
    .getPublicUrl(fileName)

  const targetUrl = urlData?.publicUrl

  const { data: marker, error: markerError } = await admin
    .from("project_markers")
    .upsert({ project_id: id, target_url: targetUrl }, { onConflict: "project_id" })
    .select()
    .single()

  if (markerError) return NextResponse.json({ error: markerError.message }, { status: 500 })

  return NextResponse.json({ marker })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin
    .from("projects")
    .select("organization_id")
    .eq("id", id)
    .single()
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })

  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", project.organization_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "editor"])
    .single()
  if (!membership) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const fileName = `target_${id}.mind`
  await admin.storage.from("markers").remove([fileName])

  await admin
    .from("project_markers")
    .update({ target_url: null })
    .eq("project_id", id)

  return NextResponse.json({ success: true })
}
