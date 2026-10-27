import { createAdminClient } from "@/lib/supabase/admin"
import { subscriptionGrantsAccess } from "@/lib/payments/access"
import { manifestResponse } from "@/lib/pwa/experience-manifest"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: collection } = await admin.from("experience_collections")
    .select("name, organization_id").eq("slug", slug).maybeSingle()
  if (!collection) return new Response(null, { status: 404 })

  const { data: subscription } = await admin.from("subscriptions")
    .select("status, trial_ends_at, current_period_end, plans(multi_project_enabled)")
    .eq("organization_id", collection.organization_id).maybeSingle()
  const plan = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans
  const active = subscriptionGrantsAccess(subscription)
  if (!active || plan?.multi_project_enabled !== true) return new Response(null, { status: 404 })

  return manifestResponse(collection.name, `/experience/multi/${encodeURIComponent(slug)}`, new URL(request.url).origin)
}
