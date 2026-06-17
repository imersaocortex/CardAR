import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureStripeKey, listInvoices } from "@/lib/stripe"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { organization_id } = body
    const admin = createAdminClient()

    if (!organization_id) {
      return NextResponse.json({ error: "organization_id é obrigatório" }, { status: 400 })
    }

    await ensureStripeKey(admin)

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe não configurado" }, { status: 400 })
    }

    const { data: customer } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("organization_id", organization_id)
      .single()

    if (!customer) {
      return NextResponse.json({
        success: true,
        synced: 0,
        results: [],
        message: "Nenhum cliente Stripe encontrado para esta organização",
      })
    }

    const { data: localSub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("organization_id", organization_id)
      .single()

    const invoices = await listInvoices(customer.stripe_customer_id)
    const results: any[] = []

    for (const invoice of invoices) {
      const inv = invoice as any
      const paymentIntentId = typeof inv.payment_intent === "string" && inv.payment_intent
        ? inv.payment_intent
        : inv.id

      const { data: existing } = await admin
        .from("stripe_payments")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .single()

      if (!existing) {
        await admin.from("stripe_payments").insert({
          organization_id,
          subscription_id: localSub?.id || null,
          stripe_payment_intent_id: paymentIntentId,
          status: invoice.status === "paid" ? "paid" : "open",
          value: (invoice.amount_paid || invoice.amount_due || 0) / 100,
          due_date: new Date().toISOString().split("T")[0],
          paid_date: invoice.status === "paid" ? new Date().toISOString() : null,
          invoice_url: invoice.hosted_invoice_url || null,
        })
        results.push({ payment_id: paymentIntentId, status: invoice.status, action: "created" })
      } else {
        results.push({ payment_id: paymentIntentId, status: invoice.status, action: "already_exists" })
      }
    }

    return NextResponse.json({ success: true, synced: results.length, results })
  } catch (err: any) {
    console.error("[stripe-sync] Error:", err)
    return NextResponse.json(
      { error: err?.message || "Erro ao sincronizar" },
      { status: 500 },
    )
  }
}
