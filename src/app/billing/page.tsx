"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check, Crown, ArrowRight, CreditCard, ExternalLink, Sparkles, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppShell } from "@/components/layout/app-shell"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

interface Plan {
  id: string
  name: string
  slug: string
  price: number
  projects_limit: number
  assets_limit_label: string
  features: string[]
  billing_cycle: string
  trial_days: number
}

interface Subscription {
  id: string
  plan_id: string
  status: string
  trial_ends_at: string | null
  plans: Plan
}

interface Checkout {
  id: string
  checkout_url: string | null
  status: string
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [usage, setUsage] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [trialDaysLeft, setTrialDaysLeft] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()

    const { data: plansData } = await supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("price")

    setPlans(plansData || [])

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()

      if (memberships) {
        const orgId = memberships.organization_id

        const { data: subData } = await supabase
          .from("subscriptions")
          .select("*, plans(*)")
          .eq("organization_id", orgId)
          .single()

        setSubscription(subData as any)

        if (subData?.trial_ends_at) {
          const end = new Date(subData.trial_ends_at)
          const now = new Date()
          const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          setTrialDaysLeft(Math.max(0, diff))
        }

        const { data: payData } = await supabase
          .from("asaas_payments")
          .select("*")
          .eq("organization_id", orgId)
          .order("due_date", { ascending: false })

        setPayments(payData || [])

        const { data: checkoutData } = await supabase
          .from("asaas_checkouts")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        setCheckout(checkoutData as any)

        const { data: usageData } = await supabase
          .from("usage_limits")
          .select("*")
          .eq("organization_id", orgId)
          .single()

        setUsage(usageData)
      }
    }

    setLoading(false)
  }

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId)
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade", plan_id: planId }),
      })

      const data = await res.json()
      if (data.error) {
        toast({ title: data.error, variant: "destructive" })
      } else {
        if (data.checkout_url) {
          window.open(data.checkout_url, "_blank")
        }
        toast({ title: "Assinatura realizada com sucesso!" })
        loadData()
      }
    } catch {
      toast({ title: "Erro ao alterar plano", variant: "destructive" })
    }
    setUpgrading(null)
  }

  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar a assinatura?")) return

    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      })

      const data = await res.json()
      if (data.error) {
        toast({ title: data.error, variant: "destructive" })
      } else {
        toast({ title: "Assinatura cancelada" })
        loadData()
      }
    } catch {
      toast({ title: "Erro ao cancelar", variant: "destructive" })
    }
  }

  const statusVariant: Record<string, "success" | "warning" | "destructive"> = {
    RECEIVED: "success",
    CONFIRMED: "success",
    PENDING: "warning",
    OVERDUE: "destructive",
    CANCELLED: "destructive",
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    )
  }

  const isTrialing = subscription?.status === "trialing"
  const isCanceled = subscription?.status === "canceled" || subscription?.status === "none"

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seu plano, assinatura e histórico de pagamentos</p>
        </div>

        {/* Trial / Status Banner */}
        {isTrialing && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-sm">
              <strong>Período de teste ativo.</strong> Você tem <strong>{trialDaysLeft} dias</strong> restantes no plano {subscription?.plans?.name}.
              Após o término, escolha um plano abaixo para continuar usando a plataforma.
            </div>
          </div>
        )}

        {subscription?.status === "past_due" && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm">
              <strong>Assinatura vencida.</strong> Regularize o pagamento para reativar seu plano.
              {checkout?.checkout_url && (
                <a href={checkout.checkout_url} target="_blank" className="ml-2 underline hover:text-primary">
                  Ir para pagamento <ExternalLink className="h-3 w-3 inline" />
                </a>
              )}
            </div>
          </div>
        )}

        {isCanceled && (
          <div className="mb-6 p-4 rounded-xl bg-muted border border-border flex items-center gap-3">
            <Crown className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-sm text-muted-foreground">
              Você está no plano <strong>Starter</strong>. Escolha um plano abaixo para desbloquear todos os recursos.
            </div>
          </div>
        )}

        {/* Usage info */}
        {usage && (
          <Card className="glass border-border/50 mb-6">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Projetos</span>
                  <p className="font-semibold">{usage.projects_used} / {usage.projects_limit === 999999 ? "∞" : usage.projects_limit}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Assets</span>
                  <p className="font-semibold">{Math.round(usage.assets_used_bytes / 1048576)}MB / {usage.assets_limit_label}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Plano</span>
                  <p className="font-semibold">{subscription?.plans?.name || "Starter"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-semibold capitalize">{isTrialing ? "Trial" : subscription?.status || "Inativo"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plan selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan, i) => {
            const isCurrent = subscription?.plans?.id === plan.id
            const cycleLabel = plan.billing_cycle === "yearly" ? " /ano" : " /mês"

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "glass rounded-2xl p-6 border transition-all duration-300",
                  isCurrent ? "border-primary/40 shadow-lg shadow-primary/10" : "border-border hover:border-primary/20"
                )}
              >
                {isCurrent && (
                  <Badge variant="purple" className="mb-3">Plano Atual</Badge>
                )}
                <div className="flex items-center gap-2 mb-4">
                  {plan.slug === "agency" && <Crown className="h-5 w-5 text-amber-400" />}
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  {plan.trial_days > 0 && !isCurrent && (
                    <Badge variant="secondary" className="text-xs">{plan.trial_days} dias grátis</Badge>
                  )}
                </div>
                <p className="text-3xl font-bold mb-4">
                  R$ {plan.price}
                  <span className="text-sm font-normal text-muted-foreground">{cycleLabel}</span>
                </p>

                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Projetos</span>
                    <span className="font-medium">{plan.projects_limit >= 999999 ? "Ilimitados" : String(plan.projects_limit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Assets</span>
                    <span className="font-medium">{plan.assets_limit_label}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ciclo</span>
                    <span className="font-medium">{plan.billing_cycle === "yearly" ? "Anual" : "Mensal"}</span>
                  </div>
                </div>

                <ul className="space-y-2 mb-6">
                  {(plan.features as string[]).map((feature, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full" disabled>
                      Plano Atual
                    </Button>
                    {(isTrialing || subscription?.status === "past_due") && checkout?.checkout_url && (
                      <Button variant="gradient" className="w-full" asChild>
                        <a href={checkout.checkout_url} target="_blank">
                          Finalizar Pagamento
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={upgrading === plan.id}
                  >
                    {upgrading === plan.id ? "Processando..." : plan.slug === "starter" ? "Plano Gratuito" : "Assinar Agora"}
                    {upgrading !== plan.id && <ArrowRight className="h-4 w-4 ml-2" />}
                  </Button>
                )}
              </motion.div>
            )
          })}
        </div>

        {subscription && !isCanceled && (
          <div className="flex justify-center mb-10">
            <Button variant="outline" size="sm" onClick={handleCancel} className="text-destructive">
              Cancelar Assinatura
            </Button>
          </div>
        )}

        {/* Payment History */}
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Histórico de Pagamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">ID</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Valor</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Vencimento</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-2 font-mono text-xs">{payment.asaas_payment_id?.slice(0, 12)}...</td>
                        <td className="py-3 px-2">R$ {(payment.value / 100).toFixed(2)}</td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {new Date(payment.due_date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant={statusVariant[payment.status] || "secondary"}>
                            {payment.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AppShell>
  )
}
