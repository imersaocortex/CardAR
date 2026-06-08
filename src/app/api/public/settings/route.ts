import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("system_settings")
    .select("branding")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ branding: null }, { status: 500 })
  }

  const branding = data?.branding || null

  return NextResponse.json({ branding })
}
