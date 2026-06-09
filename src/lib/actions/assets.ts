"use server"

import { revalidatePath } from "next/cache"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function getAssets() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)

  if (!memberships?.length) return []

  const { data } = await supabase
    .from("assets")
    .select("*")
    .eq("organization_id", memberships[0].organization_id)
    .order("created_at", { ascending: false })

  return data || []
}

export async function uploadAsset(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const file = formData.get("file") as File
  const name = formData.get("name") as string

  if (!file) return { error: "Arquivo não enviado" }

  const ext = file.name.split(".").pop()?.toLowerCase() || ""
  const isGLB = ext === "glb" || file.type === "model/gltf-binary"
  const isGLTF = ext === "gltf" || file.type === "model/gltf+json"
  const is3D = isGLB || isGLTF || file.type.startsWith("model/")
  const isVideo = file.type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)
  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)

  if (!is3D && !isVideo && !isImage) {
    return { error: "Tipo de arquivo não suportado. Use .glb, .gltf, .mp4, .png, .jpg, .webp, .gif, .webm" }
  }

  const category = is3D ? "3d" : isVideo ? "video" : "image"

  const bucket = is3D ? "models-3d" : isVideo ? "videos" : "markers"

  const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath)

  // Get org
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)

  if (!memberships?.length) return { error: "Sem organização" }

  const orgId = memberships[0].organization_id

  // Check asset limit
  const admin = createAdminClient()
  const { data: limitOk } = await admin.rpc("check_asset_limit", {
    p_organization_id: orgId,
    p_file_size_bytes: file.size,
  })

  if (limitOk === false) {
    return { error: "Limite de armazenamento atingido. Faça upgrade do plano." }
  }

  // Save to database
  const { error: dbError } = await supabase.from("assets").insert({
    organization_id: orgId,
    name: name || file.name,
    category,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: storagePath,
    public_url: publicUrl,
    uploaded_by: user.id,
  })

  if (dbError) return { error: dbError.message }

  revalidatePath("/assets")
  return { success: true, url: publicUrl }
}

export async function deleteAsset(id: string) {
  const supabase = await createServerSupabaseClient()

  // Get asset to find storage path
  const { data: asset } = await supabase
    .from("assets")
    .select("storage_path, category")
    .eq("id", id)
    .single()

  if (!asset) return { error: "Asset não encontrado" }

  const bucket = asset.category === "3d" ? "models-3d" : asset.category === "video" ? "videos" : "markers"

  // Delete from storage
  await supabase.storage.from(bucket).remove([asset.storage_path])

  // Delete from database
  const { error } = await supabase.from("assets").delete().eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/assets")
  return { success: true }
}
