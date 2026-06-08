import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { id } = await params

  // Check admin
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get org members (so we can clean up auth users)
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", id)

  const userIds = (members || []).map((m: any) => m.user_id)

  // Delete the organization (cascades to projects, scenes, objects, analytics,
  // subscriptions, usage_limits, subscription_status_history, organization_members)
  const { error: orgErr } = await admin.from("organizations").delete().eq("id", id)
  if (orgErr) {
    return NextResponse.json({ error: `Erro ao excluir organização: ${orgErr.message}` }, { status: 500 })
  }

  // Delete auth users (cascades to profiles)
  const deleteResults: { user_id: string; success: boolean; error?: string }[] = []
  for (const userId of userIds) {
    const { error: authErr } = await admin.auth.admin.deleteUser(userId)
    deleteResults.push({
      user_id: userId,
      success: !authErr,
      error: authErr?.message,
    })
  }

  return NextResponse.json({ success: true, deleted_users: deleteResults })
}
