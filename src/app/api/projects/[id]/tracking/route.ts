import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { planAllowsTrackingMode } from "@/lib/plans/tracking"

const schema = z.object({
  tracking_mode: z.enum(["marker", "surface", "gps"]),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  activation_radius: z.number().min(10).max(5000),
}).refine((value) => value.tracking_mode !== "gps" || (value.latitude !== null && value.longitude !== null), "Informe latitude e longitude para o modo GPS")

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id } = await params
  const { data: project } = await supabase.from("projects").select("organization_id").eq("id", id).single()
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })
  if (parsed.data.tracking_mode !== "marker") {
    const { data: entitlement, error: entitlementError } = await createAdminClient().from("subscriptions")
      .select("plans(gps_enabled, surface_enabled)").eq("organization_id", project.organization_id).maybeSingle()
    const plan = Array.isArray(entitlement?.plans) ? entitlement.plans[0] : entitlement?.plans
    if (entitlementError || !planAllowsTrackingMode(plan, parsed.data.tracking_mode))
      return NextResponse.json({ error: "Esta tecnologia não está disponível no seu plano." }, { status: 403 })
  }
  const { data, error } = await supabase.from("projects").update(parsed.data).eq("id", id).select("id").single()
  if (error || !data) return NextResponse.json({ error: "Não foi possível atualizar este projeto" }, { status: 403 })
  return NextResponse.json({ success: true })
}
