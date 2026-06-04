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
  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 })

  const allowed = ["image/png", "image/jpeg"]
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Formato inválido. Use PNG ou JPEG" }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 10MB" }, { status: 400 })
  }

  const ext = file.type === "image/png" ? "png" : "jpg"
  const fileName = `marker_${id}_${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { data: upload, error: uploadError } = await admin.storage
    .from("markers")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = await admin.storage
    .from("markers")
    .getPublicUrl(fileName)

  const imageUrl = urlData?.publicUrl

  if (!imageUrl) return NextResponse.json({ error: "Erro ao obter URL" }, { status: 500 })

  // Get image dimensions (server-side via a simple approach or store as-is)
  // We'll use a fixed default and let the client update if needed
  const { data: marker, error: markerError } = await admin
    .from("project_markers")
    .upsert({
      project_id: id,
      image_url: imageUrl,
      width: 0,
      height: 0,
    })
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

  const { data: existing } = await admin
    .from("project_markers")
    .select("id, image_url")
    .eq("project_id", id)
    .single()

  if (!existing) return NextResponse.json({ error: "Marcador não encontrado" }, { status: 404 })

  // Delete files from storage
  if (existing.image_url) {
    const url = new URL(existing.image_url)
    const pathParts = url.pathname.split("/")
    const fileName = pathParts[pathParts.length - 1]
    if (fileName) {
      await admin.storage.from("markers").remove([fileName])
    }
  }

  await admin.from("project_markers").delete().eq("id", existing.id)

  return NextResponse.json({ success: true })
}
