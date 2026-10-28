import { createAdminClient } from "@/lib/supabase/admin"
import { experienceAccessGranted } from "@/lib/payments/access"
import { organizationOwnedBySuperAdmin } from "@/lib/payments/platform-admin"
import { manifestResponse } from "@/lib/pwa/experience-manifest"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: project } = await admin.from("projects")
    .select("name, organization_id, status").eq("slug", slug).maybeSingle()
  if (!project || project.status !== "published") return new Response(null, { status: 404 })

  const { data: subscription } = await admin.from("subscriptions")
    .select("status, current_period_end, trial_ends_at").eq("organization_id", project.organization_id).maybeSingle()
  const superAdminOwned = await organizationOwnedBySuperAdmin(admin, project.organization_id)
  if (!experienceAccessGranted(subscription, superAdminOwned))
    return new Response(null, { status: 404 })

  return manifestResponse(project.name, `/experience/${encodeURIComponent(slug)}`, new URL(request.url).origin)
}
