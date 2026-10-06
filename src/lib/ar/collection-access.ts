import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function collectionAccess() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado", status: 401 } as const
  const { data: membership } = await supabase.from("organization_members")
    .select("organization_id, role").eq("user_id", user.id).limit(1).maybeSingle()
  if (!membership) return { error: "Organização não encontrada", status: 403 } as const
  const admin = createAdminClient()
  const { data: subscription } = await admin.from("subscriptions")
    .select("status, trial_ends_at, plans(multi_project_enabled)")
    .eq("organization_id", membership.organization_id).maybeSingle()
  const plan = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans
  const active = subscription?.status === "active" || (subscription?.status === "trialing" &&
    (!subscription.trial_ends_at || new Date(subscription.trial_ends_at) > new Date()))
  return {
    user, admin, organizationId: membership.organization_id,
    canEdit: ["owner", "admin", "editor"].includes(membership.role),
    enabled: active && plan?.multi_project_enabled === true,
  }
}
