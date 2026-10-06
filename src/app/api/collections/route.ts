import { NextResponse } from "next/server"
import { z } from "zod"
import { collectionAccess } from "@/lib/ar/collection-access"
import { generateSlug } from "@/lib/utils"
import { validateCollectionMembers } from "@/lib/ar/collection-validation"

export const collectionInput = z.object({
  name: z.string().trim().min(1).max(100),
  tracking_mode: z.enum(["marker", "gps"]),
  project_ids: z.array(z.string().uuid()).min(2).max(20),
}).superRefine((value, ctx) => {
  if (new Set(value.project_ids).size !== value.project_ids.length)
    ctx.addIssue({ code: "custom", path: ["project_ids"], message: "Não repita projetos" })
  if (value.tracking_mode === "marker" && value.project_ids.length > 10)
    ctx.addIssue({ code: "custom", path: ["project_ids"], message: "O limite é de 10 marcadores" })
})

export async function validateMembers(admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, organizationId: string, input: z.infer<typeof collectionInput>) {
  const { data: projects, error } = await admin.from("projects")
    .select("id, organization_id, tracking_mode, status, latitude, longitude, project_markers(image_url)")
    .in("id", input.project_ids)
  if (error) return "Não foi possível validar os projetos"
  return validateCollectionMembers(input.tracking_mode, organizationId, input.project_ids, projects ?? [])
}

export async function GET() {
  const access = await collectionAccess()
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const { data, error } = await access.admin.from("experience_collections")
    .select("*").eq("organization_id", access.organizationId).order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enabled: access.enabled, canEdit: access.canEdit, collections: data ?? [] })
}

export async function POST(request: Request) {
  const access = await collectionAccess()
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.canEdit || !access.enabled)
    return NextResponse.json({ error: "Este plano não permite criar experiências com vários projetos" }, { status: 403 })
  const parsed = collectionInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const invalid = await validateMembers(access.admin, access.organizationId, parsed.data)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  const { data, error } = await access.admin.from("experience_collections").insert({
    ...parsed.data, organization_id: access.organizationId, created_by: access.user.id, slug: generateSlug(12),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
