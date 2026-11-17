import { z } from "zod"

export const sliderFormats = [
  { id: "square", label: "Quadrado · 1:1", width: 1080, height: 1080 },
  { id: "portrait", label: "Vertical · 9:16", width: 1080, height: 1920 },
  { id: "landscape", label: "Horizontal · 16:9", width: 1920, height: 1080 },
] as const

export const sliderSlug = /^[a-z0-9]{21}$/
export const sliderDraftSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(100),
  width: z.number().int().min(200).max(2048),
  height: z.number().int().min(200).max(2048),
  fit: z.enum(["contain", "cover"]),
  assetIds: z.array(z.string().uuid()).max(20, "Adicione até 20 imagens"),
}).refine(({ width, height }) => width / height >= 0.25 && width / height <= 4, {
  message: "Use uma proporção entre 1:4 e 4:1.",
})

export type SliderDraft = z.infer<typeof sliderDraftSchema>
export type SliderRow = {
  id: string
  slug: string
  organization_id: string
  draft: SliderDraft
  published: SliderDraft | null
  updated_at: string
}
export type SliderAsset = { id: string; name: string; url: string }
export type SliderContent = Omit<SliderDraft, "assetIds"> & { images: SliderAsset[] }
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

export function resolveSliderContent(value: unknown, assets: Map<string, SliderAsset>): SliderContent | null {
  const parsed = sliderDraftSchema.safeParse(value)
  if (!parsed.success) return null
  const { assetIds, ...layout } = parsed.data
  const images = assetIds.flatMap((id) => {
    const asset = assets.get(id)
    return asset ? [asset] : []
  })
  return images.length ? { ...layout, images } : null
}
