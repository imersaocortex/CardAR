import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

function safeDecode(str: string): string {
  try {
    return decodeURIComponent(str.replace(/\+/g, " "))
  } catch {
    return str
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, session_id, event_type, metadata } = body

    if (!project_id) {
      return NextResponse.json({ error: "project_id é obrigatório" }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: project } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", project_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })
    }

    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || ""
    const userAgent = request.headers.get("user-agent") || ""

    let country = ""
    let city = ""
    let region = ""

    // Geo from Vercel headers if available
    if (request.headers.get("x-vercel-ip-country")) {
      country = safeDecode(request.headers.get("x-vercel-ip-country") || "")
      city = safeDecode(request.headers.get("x-vercel-ip-city") || "")
      region = safeDecode(request.headers.get("x-vercel-ip-country-region") || "")
    } else if (ip) {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,regionName`, {
          signal: AbortSignal.timeout(2000),
        })
        const geoData = await geoRes.json()
        if (geoData.status === "success") {
          country = safeDecode(geoData.country || "")
          city = safeDecode(geoData.city || "")
          region = safeDecode(geoData.regionName || "")
        }
      } catch {}
    }

    await admin.from("project_analytics").insert({
      project_id,
      organization_id: project.organization_id,
      session_id: session_id || null,
      event_type: event_type || "view",
      metadata: metadata || {},
      ip_address: ip,
      country: country || null,
      city: city || null,
      region: region || null,
      user_agent: userAgent || null,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[analytics/log] Error:", err?.message || err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
