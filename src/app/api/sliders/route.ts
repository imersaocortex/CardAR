import { NextResponse } from "next/server"
import { customAlphabet } from "nanoid"
import { z } from "zod"
import { getSliderAssets, sliderAccess } from "@/lib/sliders/server"
import { resolveSliderContent, sliderDraftSchema, type SliderDraft, type SliderLibrary, type SliderRow } from "@/lib/sliders/model"

const headers = { "Cache-Control": "private, no-store" }
const generateSliderSlug = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 21)
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const projectId = params.get("project_id") ?? undefined
  if (projectId && !z.string().uuid().safeParse(projectId).success) return error("Projeto inválido", 400)
  const access = await sliderAccess(projectId)
  if ("error" in access) return error(access.error, access.status)
  const { admin, organizationId, enabled, canEdit } = access
  const picker = params.has("picker")
  if (!enabled) return NextResponse.json({ enabled, canEdit, sliders: [], assets: [], choices: [] } satisfies SliderLibrary, { headers })
  try {
    const query = admin.from("sliders").select("*").eq("organization_id", organizationId).order("updated_at", { ascending: false })
    const { data, error: readError } = await (picker ? query.not("published", "is", null) : query)
    if (readError) throw readError
    const sliders: SliderRow[] = data ?? []
    const assetIds = picker ? [...new Set(sliders.flatMap((slider) => slider.published?.assetIds ?? []))] : undefined
    const assets = await getSliderAssets(admin, organizationId, assetIds)
    const byId = new Map(assets.map((asset) => [asset.id, asset]))
    const choices = sliders.flatMap(({ id, slug, published }) => {
      const content = resolveSliderContent(published, byId)
      return content ? [{ id, slug, content }] : []
    })
    return NextResponse.json({ enabled, canEdit, sliders: picker ? [] : sliders, assets: picker ? [] : assets, choices } satisfies SliderLibrary, { headers })
  } catch {
    return error("Não foi possível carregar os sliders.", 500)
  }
}

const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().uuid().optional(), version: z.iso.datetime({ offset: true }).optional(), draft: sliderDraftSchema, publish: z.boolean() }),
  z.object({ action: z.literal("unpublish"), id: z.string().uuid(), version: z.iso.datetime({ offset: true }) }),
])

export async function POST(request: Request) {
  const access = await sliderAccess()
  if ("error" in access) return error(access.error, access.status)
  if (!access.canEdit || !access.enabled) return error("Seu perfil ou plano não permite editar sliders.", 403)
  const parsed = mutation.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return error(parsed.error.issues[0].message, 400)
  const input = parsed.data
  const { admin, organizationId } = access
  const updated_at = new Date().toISOString()
  try {
    let changes: { updated_at: string; draft?: SliderDraft; published?: SliderDraft | null } = { updated_at }
    if (input.action === "save") {
      if (input.publish && input.draft.assetIds.length < 2) return error("Adicione pelo menos duas imagens para publicar.", 400)
      const uniqueIds = [...new Set(input.draft.assetIds)]
      if ((await getSliderAssets(admin, organizationId, uniqueIds)).length !== uniqueIds.length) {
        return error("Remova as imagens indisponíveis ou de outra organização.", 400)
      }
      changes = { ...changes, draft: input.draft, ...(input.publish ? { published: input.draft } : {}) }
    } else {
      changes.published = null
    }
    if (!input.id) {
      const slug = generateSliderSlug()
      const { data, error: writeError } = await admin.from("sliders")
        .insert({ ...changes, slug, organization_id: organizationId }).select().single()
      if (writeError) throw writeError
      return NextResponse.json(data, { status: 201, headers })
    }
    if (!input.version) return error("Recarregue o slider antes de salvar.", 409)
    const { data, error: writeError } = await admin.from("sliders").update(changes)
      .eq("organization_id", organizationId).eq("id", input.id).eq("updated_at", input.version)
      .select().maybeSingle()
    if (writeError) throw writeError
    if (!data) return error("O slider foi alterado em outra tela. Recarregue a página antes de tentar novamente.", 409)
    return NextResponse.json(data, { headers })
  } catch {
    return error("Não foi possível salvar o slider.", 500)
  }
}
