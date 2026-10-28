import type { createAdminClient } from "@/lib/supabase/admin"

// Only the super administrator's own organization is exempt from billing limits.
// Being a member of a customer organization must not grant that customer access.
export async function organizationOwnedBySuperAdmin(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<boolean> {
  const { data: owners, error: ownersError } = await admin.from("organization_members")
    .select("user_id").eq("organization_id", organizationId).eq("role", "owner")
  if (ownersError || !owners?.length) return false

  const { data: profiles, error: profilesError } = await admin.from("profiles")
    .select("id").in("id", owners.map((owner) => owner.user_id)).eq("role", "super_admin")
    .limit(1)
  return !profilesError && !!profiles?.length
}
