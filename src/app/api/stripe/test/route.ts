import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import Stripe from "stripe"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { api_key, environment } = body

    if (!api_key) {
      return NextResponse.json({ error: "API key é obrigatória" }, { status: 400 })
    }

    const stripe = new Stripe(api_key)
    await stripe.balance.retrieve()

    return NextResponse.json({
      success: true,
      environment: environment || "debug",
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Falha na conexão com Stripe" },
      { status: 502 },
    )
  }
}
