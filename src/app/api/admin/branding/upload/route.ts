import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { STORAGE_BUCKETS } from "@/lib/constants"

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"]
const MAX_SIZE = 2 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const field = formData.get("field") as string | null

  if (!file || !field) {
    return NextResponse.json({ error: "Arquivo e campo são obrigatórios" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo ${file.type} não permitido. Use PNG, JPEG, WebP, SVG ou ICO.` },
      { status: 400 },
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 2MB." }, { status: 400 })
  }

  const ext = file.name.split(".").pop() || "png"
  const fileName = `${field}-${Date.now()}.${ext}`
  const filePath = `branding/${fileName}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKETS.PUBLIC_PREVIEWS)
    .upload(filePath, buffer, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = admin.storage
    .from(STORAGE_BUCKETS.PUBLIC_PREVIEWS)
    .getPublicUrl(filePath)

  return NextResponse.json({
    url: urlData.publicUrl,
    path: filePath,
    field,
  })
}
