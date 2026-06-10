import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: project } = await supabase
    .from("projects")
    .select("*, scenes(*, scene_objects(*, scene_buttons(*)))")
    .eq("id", id)
    .single()

  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })

  // Check if subscription is valid
  const admin = createAdminClient()
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("organization_id", project.organization_id)
    .single()

  const isDisabled = sub && (sub.status === "past_due" || sub.status === "canceled")

  return NextResponse.json({
    ...project,
    disabled: !!isDisabled,
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const body = await request.json()

  // Check if project is suspended before allowing edits
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id, status")
    .eq("id", id)
    .single()

  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("organization_id", project.organization_id)
    .single()

  if (sub && (sub.status === "past_due" || sub.status === "canceled")) {
    return NextResponse.json({ error: "Assinatura vencida. Regularize o pagamento para editar projetos." }, { status: 403 })
  }

  const { error } = await supabase
    .from("projects")
    .update(body)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
