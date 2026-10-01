import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const response = NextResponse.redirect(new URL("/", request.url))
  response.headers.set("Cache-Control", "no-store")
  if (!/^[a-f0-9]{24}$/.test(code)) return response
  const { data } = await createAdminClient().from("affiliate_links").select("id").eq("code", code).eq("active", true).maybeSingle()
  if (data && !request.cookies.has("ar_referral")) response.cookies.set("ar_referral", code, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 30 * 86400, path: "/" })
  return response
}
