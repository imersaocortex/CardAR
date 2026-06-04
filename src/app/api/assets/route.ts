import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!memberships) return NextResponse.json([])

  const { data } = await supabase
    .from("assets")
    .select("*")
    .eq("organization_id", memberships.organization_id)
    .order("created_at", { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get("file") as File
  const name = formData.get("name") as string

  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 })

  const allowedTypes = ["image/png", "image/jpeg", "model/gltf-binary", "model/gltf+json", "video/mp4"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 400 })
  }

  const is3D = file.type.startsWith("model/")
  const isVideo = file.type.startsWith("video/")
  const category = is3D ? "3d" : isVideo ? "video" : "image"
  const bucket = is3D ? "models-3d" : isVideo ? "videos" : "markers"

  const ext = file.name.split(".").pop()
  const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath)

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!membership) return NextResponse.json({ error: "Sem organização" }, { status: 404 })

  const orgId = membership.organization_id
  const admin = createAdminClient()

  const { data: limitOk } = await admin.rpc("check_asset_limit", {
    p_organization_id: orgId,
    p_file_size_bytes: file.size,
  })

  if (limitOk === false) {
    return NextResponse.json({ error: "Limite de armazenamento atingido" }, { status: 403 })
  }

  const { data, error: dbError } = await supabase
    .from("assets")
    .insert({
      organization_id: orgId,
      name: name || file.name,
      category,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
      public_url: publicUrl,
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })

  return NextResponse.json(data)
}
