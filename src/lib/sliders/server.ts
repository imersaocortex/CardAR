import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { experienceAccessGranted } from "@/lib/payments/access"
import { organizationOwnedBySuperAdmin } from "@/lib/payments/platform-admin"
import { resolveSliderContent, sliderSlug, type SliderAsset, type SliderRow } from "./model"

type Admin = ReturnType<typeof createAdminClient>
type SliderAccess = { error: string; status: 401 | 403 | 404 } |
  { admin: Admin; organizationId: string; enabled: boolean; canEdit: boolean }

async function organizationCanUseSliders(admin: Admin, organizationId: string, gps = false) {
  const [{ data: subscription }, superAdminOwned] = await Promise.all([
    admin.from("subscriptions").select("status, current_period_end, trial_ends_at, plans(sliders_enabled, gps_enabled)")
      .eq("organization_id", organizationId).maybeSingle(),
    organizationOwnedBySuperAdmin(admin, organizationId),
  ])
  const plan = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans
  return experienceAccessGranted(subscription, superAdminOwned) &&
    (superAdminOwned || (plan?.sliders_enabled === true && (!gps || plan.gps_enabled === true)))
}

export async function sliderAccess(projectId?: string): Promise<SliderAccess> {
  const userClient = await createServerSupabaseClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: "Não autenticado", status: 401 } as const
  const project = projectId ? (await userClient.from("projects").select("organization_id, tracking_mode").eq("id", projectId).maybeSingle()).data : null
  if (projectId && !project) return { error: "Projeto não encontrado", status: 404 } as const
  const memberships = userClient.from("organization_members").select("organization_id, role").eq("user_id", user.id)
  const { data: membership } = await (project ? memberships.eq("organization_id", project.organization_id) : memberships.limit(1)).maybeSingle()
  if (!membership) return { error: "Organização não encontrada", status: 403 } as const
  const admin = createAdminClient()
  const organizationId = membership.organization_id
  return {
    admin, organizationId,
    enabled: (!project || project.tracking_mode !== "surface") && await organizationCanUseSliders(admin, organizationId, project?.tracking_mode === "gps"),
    canEdit: ["owner", "admin", "editor"].includes(membership.role),
  }
}

export async function getSliderAssets(admin: Admin, organizationId: string, ids?: string[]) {
  const query = () => admin.from("assets").select("id, name, storage_path")
    .eq("organization_id", organizationId).eq("category", "image")
    .in("mime_type", ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"])
  const rows: { id: string; name: string; storage_path: string }[] = []
  if (ids) {
    for (let index = 0; index < ids.length; index += 75) {
      const { data, error } = await query().in("id", ids.slice(index, index + 75))
      if (error) throw error
      rows.push(...(data ?? []))
    }
  } else {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query().order("created_at", { ascending: false }).order("id").range(offset, offset + 499)
      if (error) throw error
      rows.push(...(data ?? []))
      if (!data || data.length < 500) break
    }
  }
  return rows.flatMap(({ id, name, storage_path }): SliderAsset[] => {
    // Only raster files from the platform's image bucket can become slides.
    if (!/^[a-z0-9-]+\/[a-z0-9_.-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(storage_path)) return []
    const { data: { publicUrl } } = admin.storage.from("markers").getPublicUrl(storage_path)
    return [{ id, name, url: publicUrl }]
  })
}

export async function resolvePublishedSliders(admin: Admin, sliders: Pick<SliderRow, "id" | "published">[], organizationId: string) {
  const ids = [...new Set(sliders.flatMap((slider) => slider.published?.assetIds ?? []))]
  const assets = new Map((await getSliderAssets(admin, organizationId, ids)).map((asset) => [asset.id, asset]))
  return new Map(sliders.map((slider) => [slider.id, resolveSliderContent(slider.published, assets)]))
}

export async function getExperienceSliders(admin: Admin, organizationId: string, ids: string[]) {
  const result = new Map<string, ReturnType<typeof resolveSliderContent>>()
  // Bound filters in large collections and isolate missing/unavailable sliders.
  for (let index = 0; index < ids.length; index += 30) {
    try {
      const { data } = await admin.from("sliders").select("id, published")
        .eq("organization_id", organizationId).in("id", ids.slice(index, index + 30)).not("published", "is", null)
      const resolved = await resolvePublishedSliders(admin, data ?? [], organizationId)
      for (const [id, content] of resolved) result.set(id, content)
    } catch {
      // A slider query failure must not prevent the rest of the experience.
    }
  }
  return result
}

export const getPublicSlider = cache(async (slug: string) => {
  if (!sliderSlug.test(slug)) return null
  const admin = createAdminClient()
  const { data: slider } = await admin.from("sliders")
    .select("id, organization_id, published").eq("slug", slug).not("published", "is", null).maybeSingle()
  if (!slider || !await organizationCanUseSliders(admin, slider.organization_id)) return null
  return (await resolvePublishedSliders(admin, [slider], slider.organization_id)).get(slider.id) ?? null
})
