"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check, Crown, ArrowRight, CreditCard } from "lucide-react"
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
}

interface Subscription {
  id: string
  plan_id: string
  status: string
  plans: Plan
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)

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
        const { data: subData } = await supabase
          .from("subscriptions")
          .select("*, plans(*)")
          .eq("organization_id", memberships.organization_id)
          .single()

        setSubscription(subData as any)

        const { data: payData } = await supabase
          .from("asaas_payments")
          .select("*")
          .eq("organization_id", memberships.organization_id)
          .order("due_date", { ascending: false })

        setPayments(payData || [])
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
        toast({ title: "Plano alterado com sucesso!" })
        loadData()
      }
    } catch {
      toast({ title: "Erro ao alterar plano", variant: "destructive" })
    }
    setUpgrading(null)
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

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seu plano e histórico de pagamentos</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan, i) => {
            const isCurrent = subscription?.plans?.id === plan.id
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
                </div>
                <p className="text-3xl font-bold mb-4">
                  R$ {plan.price}
                  <span className="text-sm font-normal text-muted-foreground">/mês</span>
                </p>

                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Projetos</span>
                    <span className="font-medium">{plan.projects_limit === 999999 ? "Ilimitados" : String(plan.projects_limit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Assets</span>
                    <span className="font-medium">{plan.assets_limit_label}</span>
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

                <Button
                  variant={isCurrent ? "outline" : "gradient"}
                  className="w-full"
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || upgrading === plan.id}
                >
                  {upgrading === plan.id ? "Processando..." : isCurrent ? "Plano Atual" : "Fazer Upgrade"}
                  {!isCurrent && <ArrowRight className="h-4 w-4" />}
                </Button>
              </motion.div>
            )
          })}
        </div>

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
