import { NextResponse } from "next/server"
import { collectionAccess } from "@/lib/ar/collection-access"
import { collectionInput, validateMembers } from "../route"

type Context = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Context) {
  const access = await collectionAccess()
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.canEdit || !access.enabled)
    return NextResponse.json({ error: "Este plano não permite editar experiências com vários projetos" }, { status: 403 })
  const parsed = collectionInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const invalid = await validateMembers(access.admin, access.organizationId, parsed.data)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  const { id } = await params
  const { data, error } = await access.admin.from("experience_collections")
    .update(parsed.data).eq("id", id).eq("organization_id", access.organizationId).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: "Coleção não encontrada" }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await collectionAccess()
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.canEdit) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  const { id } = await params
  const { error } = await access.admin.from("experience_collections")
    .delete().eq("id", id).eq("organization_id", access.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
