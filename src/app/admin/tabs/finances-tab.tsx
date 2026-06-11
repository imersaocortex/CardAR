"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { DollarSign, TrendingUp, TrendingDown, CreditCard, AlertTriangle, BarChart3, Users, Trash2, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface FinanceData {
  summary: {
    total_revenue: number
    this_month_revenue: number
    last_month_revenue: number
    revenue_change_percent: number
    mrr: number
    active_subscriptions: number
    total_subscriptions: number
    churned: number
    pending_payments: number
    overdue_amount: number
    overdue_count: number
  }
  payments: any[]
  payment_status_breakdown: Record<string, number>
  top_organizations: { name: string; count: number }[]
  revenue_by_month: { month: string; revenue: number }[]
}

export function FinancesTab() {
  const { toast } = useToast()
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/finances")
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta fatura? Esta ação não pode ser desfeita.")) return
    setDeletingId(paymentId)
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Fatura excluída com sucesso" })
        load()
      } else {
        const err = await res.json()
        toast({ title: "Erro ao excluir", description: err.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erro ao excluir fatura", variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = async () => {
    if (!confirm("Tem certeza que deseja EXCLUIR TODAS as faturas? Esta ação não pode ser desfeita.")) return
    setClearingAll(true)
    try {
      const res = await fetch("/api/admin/payments", { method: "DELETE" })
      if (res.ok) {
        const result = await res.json()
        toast({ title: `${result.deleted} fatura(s) excluída(s) com sucesso` })
        load()
      } else {
        const err = await res.json()
        toast({ title: "Erro ao excluir", description: err.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erro ao excluir todas as faturas", variant: "destructive" })
    } finally {
      setClearingAll(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-muted-foreground">Erro ao carregar dados financeiros</p>
  }

  const { summary } = data

  const formatBRL = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`

  const metrics = [
    {
      label: "Receita Total",
      value: formatBRL(summary.total_revenue),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Receita do Mês",
      value: formatBRL(summary.this_month_revenue),
      icon: summary.revenue_change_percent >= 0 ? TrendingUp : TrendingDown,
      color: summary.revenue_change_percent >= 0 ? "text-emerald-500" : "text-red-500",
      bg: summary.revenue_change_percent >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
      change: `${summary.revenue_change_percent >= 0 ? "+" : ""}${summary.revenue_change_percent}% vs mês anterior`,
    },
    {
      label: "MRR (Monthly Recurring Revenue)",
      value: formatBRL(summary.mrr),
      icon: BarChart3,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Inadimplência",
      value: formatBRL(summary.overdue_amount),
      icon: AlertTriangle,
      color: "text-red-500",
      bg: "bg-red-500/10",
      sub: `${summary.overdue_count} cobranças vencidas`,
    },
  ]

  const subMetrics = [
    { label: "Assinaturas Ativas", value: summary.active_subscriptions, icon: Users },
    { label: "Total de Assinaturas", value: summary.total_subscriptions, icon: CreditCard },
    { label: "Cancelamentos", value: summary.churned, icon: TrendingDown },
    { label: "Pagamentos Pendentes", value: summary.pending_payments, icon: AlertTriangle },
  ]

  const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
    RECEIVED: "success",
    CONFIRMED: "success",
    PENDING: "warning",
    OVERDUE: "destructive",
  }

  const statusLabel: Record<string, string> = {
    RECEIVED: "Recebido",
    CONFIRMED: "Confirmado",
    PENDING: "Pendente",
    OVERDUE: "Vencido",
    REFUNDED: "Reembolsado",
    CANCELLED: "Cancelado",
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {metrics.map((metric, i) => {
            const Icon = metric.icon
            return (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="glass border-border/50">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{metric.label}</p>
                        <p className="text-2xl font-bold">{metric.value}</p>
                        {"change" in metric && (
                          <p className="text-xs" style={{ color: summary.revenue_change_percent >= 0 ? "#10b981" : "#ef4444" }}>
                            {(metric as any).change}
                          </p>
                        )}
                        {"sub" in metric && (
                          <p className="text-xs text-muted-foreground">{(metric as any).sub}</p>
                        )}
                      </div>
                      <div className={`w-10 h-10 rounded-lg ${metric.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${metric.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {subMetrics.map((m, i) => {
          const Icon = m.icon
          return (
            <Card key={m.label} className="glass border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-bold">{m.value}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {data.revenue_by_month.length > 0 && (
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Receita Mensal (R$)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-end h-40">
              {data.revenue_by_month.map((item) => {
                const maxRevenue = Math.max(...data.revenue_by_month.map((r) => r.revenue), 1)
                const height = (item.revenue / maxRevenue) * 100
                const [year, month] = item.month.split("-")
                const label = `${month}/${year.slice(2)}`
                return (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{item.revenue.toFixed(0)}</span>
                    <div
                      className="w-full bg-primary/20 rounded-t-md hover:bg-primary/30 transition-colors relative"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    >
                      <div
                        className="absolute bottom-0 w-full bg-primary rounded-t-md"
                        style={{ height: "100%" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Status dos Pagamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.payment_status_breakdown).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[status] || "secondary"}>
                      {statusLabel[status] || status}
                    </Badge>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(data.payment_status_breakdown).length === 0 && (
                <p className="text-muted-foreground text-sm">Nenhum pagamento registrado</p>
              )}
            </div>
          </CardContent>
        </Card>

        {data.top_organizations.length > 0 && (
          <Card className="glass border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Organizações com Mais Projetos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.top_organizations.map((org, i) => (
                  <div key={org.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-5">{i + 1}.</span>
                      <span className="font-medium text-sm">{org.name}</span>
                    </div>
                    <span className="text-sm font-medium">{org.count} projetos</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="glass border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Últimos Pagamentos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAll}
                disabled={clearingAll || data.payments.length === 0}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                {clearingAll ? "Excluindo..." : "Excluir Todas"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Organização</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">ID ASAAS</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Valor</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Vencimento</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Pagamento</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum pagamento encontrado
                    </td>
                  </tr>
                )}
                {data.payments.map((payment: any) => (
                  <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-medium">{payment.organizations?.name || "-"}</td>
                    <td className="py-3 px-4 font-mono text-xs">{payment.asaas_payment_id?.slice(0, 16)}</td>
                    <td className="py-3 px-4 font-medium">R$ {Number(payment.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {new Date(payment.due_date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {payment.paid_date
                        ? new Date(payment.paid_date).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={statusVariant[payment.status] || "secondary"}>
                        {statusLabel[payment.status] || payment.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePayment(payment.id)}
                        disabled={deletingId === payment.id}
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
