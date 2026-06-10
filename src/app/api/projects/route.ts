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

  // Check subscription status for each org to determine if projects are disabled
  const admin = createAdminClient()
  const projectsWithStatus = await Promise.all(
    (data || []).map(async (project) => {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("status")
        .eq("organization_id", project.organization_id)
        .single()

      const isSuspended = sub && (sub.status === "past_due" || sub.status === "canceled")

      return {
        ...project,
        disabled: !!isSuspended,
      }
    }),
  )

  return NextResponse.json(projectsWithStatus)
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

  const admin = createAdminClient()

  // Check subscription status
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("organization_id", orgId)
    .single()

  if (sub) {
    const trialExpired = sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()
    if (sub.status === "past_due") {
      return NextResponse.json({ error: "Assinatura vencida. Regularize o pagamento para criar projetos." }, { status: 403 })
    }
    if (sub.status === "canceled") {
      return NextResponse.json({ error: "Assinatura cancelada. Escolha um plano para criar projetos." }, { status: 403 })
    }
    if (sub.status === "pending") {
      return NextResponse.json({ error: "Assinatura pendente de pagamento. Acesse a página de cobrança para pagar." }, { status: 403 })
    }
    if (sub.status === "trialing" && trialExpired) {
      return NextResponse.json({ error: "Período de teste expirado. Assine um plano para continuar." }, { status: 403 })
    }
  }

  // Check limit
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
