import { z } from "zod"
import { sliderTransitions } from "./transitions"

export const sliderFormats = [
  { id: "square", label: "Quadrado · 1:1", width: 1080, height: 1080 },
  { id: "portrait", label: "Vertical · 9:16", width: 1080, height: 1920 },
  { id: "landscape", label: "Horizontal · 16:9", width: 1920, height: 1080 },
] as const

export const sliderSlug = /^[a-z0-9]{21}$/
export const sliderImageLinkMaxLength = 2048

export function normalizeSliderImageLink(value: string | undefined) {
  const link = value?.trim()
  if (!link || link.length > sliderImageLinkMaxLength || !/^https?:\/\//i.test(link) || /\s|\\/.test(link)) return undefined
  try {
    const url = new URL(link)
    if (url.username || url.password || url.href.length > sliderImageLinkMaxLength) return undefined
    return url.href
  } catch {
    return undefined
  }
}

export const sliderDraftSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(100),
  width: z.number().int().min(200).max(2048),
  height: z.number().int().min(200).max(2048),
  fit: z.enum(["contain", "cover"]),
  transition: z.enum(sliderTransitions).default("none"),
  assetIds: z.array(z.string().uuid()).max(20, "Adicione até 20 imagens"),
  imageLinks: z.array(z.string().trim().transform((link, ctx) => {
    if (!link) return ""
    const url = normalizeSliderImageLink(link)
    if (url) return url
    ctx.addIssue({ code: "custom", message: "Informe um link válido começando com https:// ou http://." })
    return z.NEVER
  })).max(20).default([]),
}).refine(({ width, height }) => width / height >= 0.25 && width / height <= 4, {
  message: "Use uma proporção entre 1:4 e 4:1.",
}).refine(({ assetIds, imageLinks }) => imageLinks.length <= assetIds.length, {
  path: ["imageLinks"],
  message: "Cada link deve corresponder a uma imagem.",
})

export type SliderDraft = z.infer<typeof sliderDraftSchema>
type StoredSliderDraft = z.input<typeof sliderDraftSchema>
export type SliderRow = {
  id: string
  slug: string
  organization_id: string
  draft: StoredSliderDraft
  published: StoredSliderDraft | null
  updated_at: string
}
export type SliderAsset = { id: string; name: string; url: string }
export type SliderImage = SliderAsset & { link?: string }
export type SliderContent = Omit<SliderDraft, "assetIds" | "imageLinks"> & { images: SliderImage[] }
export type SliderChoice = { id: string; slug: string; content: SliderContent }
export type SliderLibrary = {
  enabled: boolean
  canEdit: boolean
  sliders: SliderRow[]
  choices: SliderChoice[]
  assets: SliderAsset[]
}

export function sliderLink(slug: string) {
  return `/sliders/${slug}`
}

export function parseSliderLink(value: string, origin: string) {
  try {
    const url = new URL(value.trim(), origin)
    if (url.origin !== origin || url.username || url.password) return null
    const slug = /^\/sliders\/([^/]+)\/?$/.exec(url.pathname)?.[1]
    return slug && sliderSlug.test(slug) ? slug : null
  } catch {
    return null
  }
}

export function resolveSliderImages({ assetIds, imageLinks }: Pick<SliderDraft, "assetIds" | "imageLinks">, assets: Map<string, SliderAsset>): SliderImage[] {
  return assetIds.flatMap((id, index) => {
    const asset = assets.get(id)
    if (!asset) return []
    const link = normalizeSliderImageLink(imageLinks[index])
    return [{ ...asset, ...(link ? { link } : {}) }]
  })
}

export function resolveSliderContent(value: unknown, assets: Map<string, SliderAsset>): SliderContent | null {
  const parsed = sliderDraftSchema.safeParse(value)
  if (!parsed.success) return null
  const { assetIds, imageLinks, ...layout } = parsed.data
  const images = resolveSliderImages({ assetIds, imageLinks }, assets)
  return images.length ? { ...layout, images } : null
}
