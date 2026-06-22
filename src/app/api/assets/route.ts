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

  // Check allowed media types from the organization's plan
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!membership) return NextResponse.json({ error: "Sem organização" }, { status: 404 })

  const orgId = membership.organization_id
  const admin = createAdminClient()

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("organization_id", orgId)
    .single()

  const ext = file.name.split(".").pop()?.toLowerCase() || ""

  // Map known 3D extensions to proper MIME types (browsers often send application/octet-stream)
  const extMimeMap: Record<string, string> = {
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
  }

  const detectedMime = extMimeMap[ext] || file.type

  const isGLB = ext === "glb" || file.type === "model/gltf-binary"
  const isGLTF = ext === "gltf" || file.type === "model/gltf+json"
  const is3D = isGLB || isGLTF || file.type.startsWith("model/")
  const isVideo = file.type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)
  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)

  if (!is3D && !isVideo && !isImage) {
    return NextResponse.json({ error: "Tipo de arquivo não suportado. Use .glb, .gltf, .mp4, .png, .jpg" }, { status: 400 })
  }

  let allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "model/gltf-binary", "model/gltf+json", "video/mp4", "video/webm", "video/quicktime"]
  if (sub?.plan_id) {
    const { data: plan } = await admin
      .from("plans")
      .select("allowed_media_types")
      .eq("id", sub.plan_id)
      .single()
    if (plan?.allowed_media_types && Array.isArray(plan.allowed_media_types) && plan.allowed_media_types.length > 0) {
      allowedTypes = plan.allowed_media_types
    }
  }

  // Check against allowed types (also accept application/octet-stream for .glb/.gltf)
  const typeOk = allowedTypes.includes(detectedMime) || (is3D && allowedTypes.some(t => t.startsWith("model/")))
  if (!typeOk) {
    return NextResponse.json({ error: "Seu plano não permite este tipo de arquivo" }, { status: 403 })
  }

  const category = is3D ? "3d" : isVideo ? "video" : "image"
  const bucket = is3D ? "models-3d" : isVideo ? "videos" : "markers"

  const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, { contentType: detectedMime })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath)

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
      mime_type: detectedMime,
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
