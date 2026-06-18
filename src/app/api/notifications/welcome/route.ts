import { NextRequest, NextResponse } from "next/server"
import { sendWelcomeNotification } from "@/lib/evolution"

export async function POST(request: NextRequest) {
  try {
    const { organizationId, userName } = await request.json()

    if (!organizationId || !userName) {
      return NextResponse.json({ error: "organizationId and userName required" }, { status: 400 })
    }

    const sent = await sendWelcomeNotification(organizationId, userName)

    return NextResponse.json({ success: true, sent })
  } catch (err: any) {
    console.error("[notifications/welcome] Error:", err)
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 })
  }
}
