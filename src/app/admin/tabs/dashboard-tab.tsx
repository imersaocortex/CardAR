"use client"

import { motion } from "framer-motion"
import { Users, FolderKanban, Activity, UserCircle, CreditCard, Eye, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DashboardTabProps {
  data: any
}

export function DashboardTab({ data }: DashboardTabProps) {
  const totalViews = data.summary?.total_views || data.projects.reduce((s: number, p: any) => s + (p.views || 0), 0)

  const metrics = [
    { label: "Organizações", value: String(data.organizations.length), icon: Users, sub: `${data.summary?.active_subscriptions || 0} assinaturas ativas` },
    { label: "Projetos", value: String(data.projects.length), icon: FolderKanban, sub: `${data.summary?.published_projects || 0} publicados, ${data.summary?.draft_projects || 0} rascunhos` },
    { label: "Usuários", value: String(data.users.length), icon: UserCircle, sub: "cadastrados" },
    { label: "Visualizações", value: String(totalViews), icon: Eye, sub: "total em todos os projetos" },
  ]

  const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
    RECEIVED: "success",
    CONFIRMED: "success",
    PENDING: "warning",
    OVERDUE: "destructive",
    active: "success",
    past_due: "warning",
    canceled: "destructive",
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <p className="text-3xl font-bold">{metric.value}</p>
                      <p className="text-xs text-muted-foreground">{metric.sub}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Últimos Pagamentos
          </CardTitle>
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum pagamento encontrado
                    </td>
                  </tr>
                )}
                {data.payments.slice(0, 10).map((payment: any, i: number) => (
                  <tr key={payment.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-medium">{payment.organizations?.name || "-"}</td>
                    <td className="py-3 px-4 font-mono text-xs">{payment.asaas_payment_id?.slice(0, 16)}</td>
                    <td className="py-3 px-4">R$ {Number(payment.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {new Date(payment.due_date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={statusVariant[payment.status] || "secondary"}>{payment.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Organizações Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Membros</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.organizations.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhuma organização encontrada
                      </td>
                    </tr>
                  )}
                  {data.organizations.slice(0, 5).map((org: any) => (
                    <tr key={org.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium">{org.name}</td>
                      <td className="py-3 px-4">{org.organization_members?.length || 0}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Últimas Cenas Criadas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cena</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Projeto</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.scenes || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhuma cena encontrada
                      </td>
                    </tr>
                  )}
                  {(data.scenes || []).slice(0, 5).map((scene: any) => (
                    <tr key={scene.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium">{scene.name}</td>
                      <td className="py-3 px-4">{scene.projects?.name || "-"}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(scene.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
