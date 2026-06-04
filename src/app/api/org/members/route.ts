import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get("organizationId")

  if (!orgId) return NextResponse.json({ error: "organizationId é obrigatório" }, { status: 400 })

  const admin = createAdminClient()

  const { data } = await admin
    .from("organization_members")
    .select("*, profiles(*)")
    .eq("organization_id", orgId)

  return NextResponse.json(data || [])
}
