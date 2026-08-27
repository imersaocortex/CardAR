"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check, Crown, ArrowRight, CreditCard, ExternalLink, Sparkles, AlertTriangle, CheckCircle2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppShell } from "@/components/layout/app-shell"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { GatewaySelector } from "@/components/billing/gateway-selector"
import { formatDate } from "@/lib/format"

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
  payment_provider?: string
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
  const [upgraded, setUpgraded] = useState(false)
  const [showGatewaySelector, setShowGatewaySelector] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [gatewaySettings, setGatewaySettings] = useState<{ asaas: { configured: boolean }; stripe: { configured: boolean } } | null>(null)
  const [isFirstPayment, setIsFirstPayment] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    if (window.location.search.includes("upgraded=true")) {
      setUpgraded(true)
      window.history.replaceState({}, "", "/billing")
    }
    if (window.location.search.includes("checkout_success=true")) {
      window.history.replaceState({}, "", "/billing")
      fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout_success" }),
      }).then((r) => r.json()).then((data) => {
        if (data.success) setUpgraded(true)
        loadData()
      }).catch(() => { loadData() })
    } else {
      loadData()
    }
    loadGatewaySettings()
  }, [])

  async function loadGatewaySettings() {
    try {
      const res = await fetch("/api/billing/settings")
      const data = await res.json()
      setGatewaySettings(data)
    } catch {}
  }

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      setIsSuperAdmin(profile?.role === "super_admin")

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

        const { data: stripePayData } = await supabase
          .from("stripe_payments")
          .select("*")
          .eq("organization_id", orgId)
          .order("due_date", { ascending: false })

        const allPayments = [
          ...(payData || []).map((p: any) => ({ ...p, _gateway: "asaas" })),
          ...(stripePayData || []).map((p: any) => ({ ...p, _gateway: "stripe" })),
        ].sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

        setPayments(allPayments)

        const provider = subData?.payment_provider || "asaas"
        const checkoutTable = provider === "stripe" ? "stripe_checkouts" : "asaas_checkouts"

        const { data: checkoutData } = await supabase
          .from(checkoutTable as any)
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

  const handleUpgradeClick = async (planId: string) => {
    const asaasConfigured = gatewaySettings?.asaas?.configured
    const stripeConfigured = gatewaySettings?.stripe?.configured

    if (asaasConfigured && stripeConfigured) {
      setPendingPlanId(planId)
      setIsFirstPayment(false)
      setShowGatewaySelector(true)
      return
    }

    await doUpgrade(planId, "asaas")
  }

  const handleFirstPaymentClick = async () => {
    const asaasConfigured = gatewaySettings?.asaas?.configured
    const stripeConfigured = gatewaySettings?.stripe?.configured

    if (asaasConfigured && stripeConfigured) {
      setPendingPlanId(null)
      setIsFirstPayment(true)
      setShowGatewaySelector(true)
      return
    }

    await doFirstPayment("asaas")
  }

  const handleGatewaySelect = async (gateway: "asaas" | "stripe") => {
    setShowGatewaySelector(false)

    if (isFirstPayment) {
      await doFirstPayment(gateway)
    } else if (pendingPlanId) {
      await doUpgrade(pendingPlanId, gateway)
    }
  }

  const doFirstPayment = async (provider: string) => {
    setUpgrading("first_payment")
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "first_payment", payment_provider: provider }),
      })
      const data = await res.json()
      if (data.error) {
        if (data.redirect) {
          window.location.href = data.redirect
          return
        }
        toast({ title: data.error, variant: "destructive" })
      } else {
        if (data.checkout_url) {
          window.location.href = data.checkout_url
          return
        }
        toast({ title: "Checkout criado! Finalize o pagamento." })
        loadData()
      }
    } catch {
      toast({ title: "Erro ao gerar pagamento", variant: "destructive" })
    }
    setUpgrading(null)
  }

  const doUpgrade = async (planId: string, provider: string) => {
    setUpgrading(planId)
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade", plan_id: planId, payment_provider: provider }),
      })

      const data = await res.json()
      if (data.error) {
        toast({ title: data.error, variant: "destructive" })
      } else {
        if (data.checkout_url) {
          window.location.href = data.checkout_url
          return
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

  const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
    RECEIVED: "success",
    CONFIRMED: "success",
    PENDING: "warning",
    OVERDUE: "destructive",
    CANCELLED: "destructive",
    paid: "success",
    open: "warning",
    failed: "destructive",
  }

  const statusLabel: Record<string, string> = {
    RECEIVED: "Recebido",
    CONFIRMED: "Confirmado",
    PENDING: "Pendente",
    OVERDUE: "Vencido",
    CANCELLED: "Cancelado",
    paid: "Pago",
    open: "Aberto",
    failed: "Falhou",
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
  const isPending = subscription?.status === "pending"
  const isCanceled = subscription?.status === "canceled" || subscription?.status === "none"
  const provider = subscription?.payment_provider || "asaas"

  return (
    <AppShell>
      <GatewaySelector
        open={showGatewaySelector}
        onOpenChange={setShowGatewaySelector}
        onSelect={handleGatewaySelect}
        loading={upgrading !== null}
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seu plano, assinatura e histórico de pagamentos</p>
        </div>

        {upgraded && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="text-sm">
              <strong>Plano ativado com sucesso!</strong> Sua assinatura já está ativa e você pode usar todos os recursos do plano.
            </div>
          </div>
        )}

        {subscription?.payment_provider && (
          <div className="mb-6 p-3 rounded-xl bg-muted/30 border border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            Pagamentos processados via <strong className="text-foreground capitalize">{provider === "stripe" ? "Stripe" : "ASAAS"}</strong>
          </div>
        )}

        {isTrialing && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-sm">
              <strong>Período de teste ativo.</strong> Você tem <strong>{trialDaysLeft} dias</strong> restantes no plano {subscription?.plans?.name}.
              Após o término, escolha um plano abaixo para continuar usando a plataforma.
            </div>
          </div>
        )}

        {isPending && (
          <div className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary shrink-0" />
            <div className="text-sm flex-1">
              <strong>Assinatura pendente de pagamento.</strong> Você está no plano <strong>Starter</strong>.
              Efetue o pagamento para liberar a criação de projetos.
            </div>
            {isSuperAdmin && (
              <Button
                variant="gradient"
                size="sm"
                onClick={handleFirstPaymentClick}
                disabled={upgrading === "first_payment"}
              >
                {upgrading === "first_payment" ? "Gerando..." : "Pagar Agora"}
                <ExternalLink className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
        {subscription?.status === "past_due" && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm">
              <strong>Assinatura vencida.</strong> Regularize o pagamento para reativar seu plano e seus projetos.
              {checkout?.checkout_url && (
                <a href={checkout.checkout_url} target="_blank" className="ml-2 underline hover:text-primary">
                  Ir para pagamento <ExternalLink className="h-3 w-3 inline" />
                </a>
              )}
            </div>
          </div>
        )}

        {isCanceled && (
          <div className="mb-6 p-4 rounded-xl bg-muted border border-border flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Crown className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="text-sm text-muted-foreground">
                Sua assinatura está <strong>cancelada</strong>. Reative agora e escolha um plano para desbloquear todos os recursos.
              </div>
            </div>
            {isSuperAdmin && (
              <Button
                variant="gradient"
                size="sm"
                onClick={() => {
                  document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })
                }}
                className="shrink-0"
              >
                Reativar Assinatura
              </Button>
            )}
          </div>
        )}

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
                  <p className="font-semibold capitalize">{isTrialing ? "Trial" : isPending ? "Pendente" : subscription?.status || "Inativo"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div id="planos" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
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
                  R$ {plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                ) : isSuperAdmin ? (
                  <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => handleUpgradeClick(plan.id)}
                    disabled={upgrading === plan.id}
                  >
                    {upgrading === plan.id ? "Processando..." : "Assinar Agora"}
                    {upgrading !== plan.id && <ArrowRight className="h-4 w-4 ml-2" />}
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    Alteração restrita a administradores
                  </Button>
                )}
              </motion.div>
            )
          })}
        </div>

        {subscription && !isCanceled && isSuperAdmin && (
          <div className="flex justify-center mb-10">
            <Button variant="outline" size="sm" onClick={handleCancel} className="text-destructive">
              Cancelar Assinatura
            </Button>
          </div>
        )}

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
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Gateway</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">ID</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Valor</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Vencimento</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const idField = payment._gateway === "stripe" ? payment.stripe_payment_intent_id : payment.asaas_payment_id
                      return (
                        <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-2">
                            <Badge variant={payment._gateway === "stripe" ? "secondary" : "outline"} className="text-[10px]">
                              {payment._gateway === "stripe" ? "Stripe" : "ASAAS"}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 font-mono text-xs">{idField?.slice(0, 12)}...</td>
                          <td className="py-3 px-2">R$ {Number(payment.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3 px-2 text-muted-foreground">
                            {formatDate(payment.due_date)}
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={statusVariant[payment.status] || "secondary"}>
                              {statusLabel[payment.status] || payment.status}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
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
