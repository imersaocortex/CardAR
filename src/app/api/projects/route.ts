import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createProjectSchema } from "@/lib/schemas"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateSlug } from "@/lib/utils"

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)

  if (!memberships?.length) return NextResponse.json([])

  const orgIds = memberships.map(m => m.organization_id)

  const { data } = await supabase
    .from("projects")
    .select("*, scenes(*)")
    .in("organization_id", orgIds)
    .order("updated_at", { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await request.json()
  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "editor"])
    .limit(1)
    .single()

  if (!membership) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

  const orgId = membership.organization_id

  // Check limit
  const admin = createAdminClient()
  const { data: limitOk } = await admin.rpc("check_project_limit", {
    p_organization_id: orgId,
  })

  if (limitOk === false) {
    return NextResponse.json({ error: "Limite de projetos atingido" }, { status: 403 })
  }

  const slug = generateSlug()

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      slug,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(data)
}
