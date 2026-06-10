import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureAsaasKey, getPaymentsByCustomer, getSubscription } from "@/lib/asaas"

export async function POST(request: Request) {
  const admin = createAdminClient()

  const supabase = await (await import("@/lib/supabase/server")).createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const body = await request.json()
  const { organization_id } = body

  if (!organization_id) {
    return NextResponse.json({ error: "organization_id é obrigatório" }, { status: 400 })
  }

  await ensureAsaasKey(admin)

  if (!process.env.ASAAS_API_KEY) {
    return NextResponse.json({ error: "ASAAS não configurado" }, { status: 400 })
  }

  const { data: customer } = await admin
    .from("asaas_customers")
    .select("asaas_customer_id")
    .eq("organization_id", organization_id)
    .single()

  if (!customer) {
    return NextResponse.json({ error: "Cliente ASAAS não encontrado" }, { status: 404 })
  }

  const results: any[] = []

  try {
    const payments = await getPaymentsByCustomer(customer.asaas_customer_id)

    for (const payment of payments) {
      const { data: existing } = await admin
        .from("asaas_payments")
        .select("id")
        .eq("asaas_payment_id", payment.id)
        .single()

      if (!existing) {
        const { data: localSub } = await admin
          .from("subscriptions")
          .select("id")
          .eq("organization_id", organization_id)
          .single()

        await admin.from("asaas_payments").insert({
          organization_id,
          subscription_id: localSub?.id || null,
          asaas_payment_id: payment.id,
          status: payment.status || "PENDING",
          value: payment.value || 0,
          due_date: payment.dueDate || new Date().toISOString().split("T")[0],
          paid_date: payment.paidDate || null,
          invoice_url: payment.invoiceUrl || null,
        })
        results.push({ payment_id: payment.id, status: payment.status, action: "created" })
      } else {
        results.push({ payment_id: payment.id, status: payment.status, action: "already_exists" })
      }

      // Save subscription ID if present
      if (payment.subscription) {
        await admin
          .from("subscriptions")
          .update({ asaas_subscription_id: payment.subscription })
          .eq("organization_id", organization_id)

        // Extend period if payment is confirmed
        if (payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
          const { data: currentSub } = await admin
            .from("subscriptions")
            .select("current_period_end, status")
            .eq("organization_id", organization_id)
            .single()

          if (currentSub && currentSub.status !== "active") {
            await admin
              .from("subscriptions")
              .update({ status: "active" })
              .eq("organization_id", organization_id)
          }
        }
      }
    }

    return NextResponse.json({ success: true, synced: results.length, results })
  } catch (err: any) {
    console.error("[sync] Error syncing ASAAS data:", err)
    return NextResponse.json({ error: err?.message || "Erro ao sincronizar" }, { status: 502 })
  }
}
