"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Search, Users, FolderKanban, CreditCard, ChevronDown, ChevronUp,
  Globe, Eye, MousePointerClick, FileText, Loader2, AlertTriangle, Trash2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Customer {
  id: string
  name: string
  slug: string
  created_at: string
  organization_members: {
    id: string
    user_id: string
    role: string
    profiles: {
      id: string
      name: string
      email: string
      avatar_url: string | null
      role: string
      created_at: string
    }
  }[]
  subscription: {
    id: string
    status: string
    current_period_end: string
    trial_ends_at: string | null
    plan: { id: string; name: string; slug: string; price: number }
  } | null
  usage_limits: {
    projects_limit: number
    assets_limit_bytes: number
    projects_used: number
    assets_used_bytes: number
  } | null
  projects_count: number
}

interface OrgDetail {
  organization: any
  projects: any[]
  subscription: any
  usage: any
  analytics: {
    total_views: number
    total_clicks: number
    total_events: number
    unique_countries: number
    recent_events: any[]
  }
  payments: any[]
}

const statusOptions = [
  { value: "active", label: "Ativo", color: "success" as const },
  { value: "trialing", label: "Trial", color: "secondary" as const },
  { value: "past_due", label: "Vencido", color: "warning" as const },
  { value: "canceled", label: "Cancelado", color: "destructive" as const },
]

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  past_due: "warning",
  canceled: "destructive",
  trialing: "secondary",
  incomplete: "warning",
}

const formatBytes = (bytes: number) => {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return `${bytes} B`
}

export function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [changingStatus, setChangingStatus] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const loadCustomers = async (q: string) => {
    setLoading(true)
    setApiError(null)
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : ""
      const res = await fetch(`/api/admin/customers${params}`)
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error || `Erro HTTP ${res.status}`)
        setCustomers([])
      } else if (!Array.isArray(data)) {
        setApiError("Resposta inesperada da API")
        setCustomers([])
      } else {
        setCustomers(data)
      }
    } catch (err: any) {
      console.error(err)
      setApiError(err.message || "Erro de rede")
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers("")
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadCustomers(search)
  }

  const loadOrgDetail = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setLoadingDetail(true)
    setOrgDetail(null)
    try {
      const res = await fetch(`/api/admin/orgs/${customer.id}`)
      if (res.ok) {
        const data = await res.json()
        setOrgDetail(data)
      }
    } catch (err) {
      console.error(err)
    }
    setLoadingDetail(false)
  }

  const handleStatusChange = async (newStatus: string, reason: string) => {
    if (!orgDetail?.subscription?.id) return
    setChangingStatus(newStatus)
    try {
      const res = await fetch(`/api/admin/subscriptions/${orgDetail.subscription.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      })
      if (res.ok) {
        // Reload detail
        if (selectedCustomer) await loadOrgDetail(selectedCustomer)
        // Reload list
        await loadCustomers(search)
      }
    } catch (err) {
      console.error(err)
    }
    setChangingStatus(null)
  }

  const handleDelete = async () => {
    if (!selectedCustomer) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/customers/${selectedCustomer.id}`, { method: "DELETE" })
      if (res.ok) {
        setConfirmDelete(false)
        setSelectedCustomer(null)
        setOrgDetail(null)
        await loadCustomers(search)
      } else {
        const data = await res.json()
        alert(`Erro ao excluir: ${data.error || "Erro desconhecido"}`)
      }
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`)
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass border-border/50">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Gerenciamento de Clientes
              </CardTitle>
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar organização..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm">Buscar</Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Organização</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Membros</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Projetos</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Plano</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Uso</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Criada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiError && (
                      <tr>
                        <td colSpan={7} className="text-center py-4">
                          <p className="text-destructive text-sm font-medium">Erro: {apiError}</p>
                          <button
                            onClick={() => loadCustomers(search)}
                            className="text-primary text-xs underline mt-1 hover:no-underline"
                          >
                            Tentar novamente
                          </button>
                        </td>
                      </tr>
                    )}
                    {!apiError && customers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-muted-foreground">
                          Nenhum cliente encontrado
                        </td>
                      </tr>
                    )}
                    {customers.map((customer) => {
                      const usage = customer.usage_limits
                      const usagePercent = usage
                        ? Math.round((usage.projects_used / Math.max(usage.projects_limit, 1)) * 100)
                        : 0

                      return (
                        <tr
                          key={customer.id}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => loadOrgDetail(customer)}
                        >
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-medium">{customer.name}</span>
                              <span className="text-muted-foreground ml-2 text-xs">({customer.slug})</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex -space-x-2">
                              {customer.organization_members.slice(0, 3).map((m) => (
                                <div
                                  key={m.id}
                                  className="w-7 h-7 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-medium"
                                  title={m.profiles?.name || "?"}
                                >
                                  {(m.profiles?.name || "?")[0]}
                                </div>
                              ))}
                              {customer.organization_members.length > 3 && (
                                <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
                                  +{customer.organization_members.length - 3}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium">{customer.projects_count}</span>
                          </td>
                          <td className="py-3 px-4">
                            {customer.subscription?.plan ? (
                              <span className="font-medium">{customer.subscription.plan.name}</span>
                            ) : (
                              <span className="text-muted-foreground">Sem plano</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {customer.subscription ? (
                              <Badge variant={statusVariant[customer.subscription.status] || "secondary"}>
                                {customer.subscription.status === "active" ? "Ativo" :
                                 customer.subscription.status === "past_due" ? "Vencido" :
                                 customer.subscription.status === "canceled" ? "Cancelado" :
                                 customer.subscription.status === "trialing" ? "Trial" :
                                 customer.subscription.status}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Inativo</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <FolderKanban className="h-3 w-3 text-muted-foreground" />
                                <span>{usage?.projects_used || 0}/{usage?.projects_limit || 0}</span>
                                {usage && usage.projects_limit > 0 && (
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${usagePercent >= 80 ? "bg-destructive" : "bg-primary"}`}
                                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">💾</span>
                                <span>
                                  {usage ? formatBytes(usage.assets_used_bytes) : "0"}/{usage?.assets_limit_bytes ? formatBytes(usage.assets_limit_bytes) : "0"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">
                            {new Date(customer.created_at).toLocaleDateString("pt-BR")}
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

      {/* Detail Panel */}
      {selectedCustomer && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {selectedCustomer.name}
                </CardTitle>
                <div className="flex gap-2">
                  {!confirmDelete ? (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Confirmar?
                      </span>
                      <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
                        {deleting ? "Excluindo..." : "Sim, excluir"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedCustomer(null); setOrgDetail(null) }}>
                    Fechar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : orgDetail ? (
                <div className="space-y-6">
                  {/* Subscription Management */}
                  <div className="p-4 rounded-xl bg-muted/20">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Gerenciar Assinatura
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="text-sm space-y-1">
                        <span className="text-muted-foreground">Plano:</span>
                        <p className="font-medium">{orgDetail.subscription?.plan?.name || "—"}</p>
                      </div>
                      <div className="text-sm space-y-1">
                        <span className="text-muted-foreground">Status atual:</span>
                        <p>
                          <Badge variant={statusVariant[orgDetail.subscription?.status] || "secondary"}>
                            {orgDetail.subscription?.status || "N/A"}
                          </Badge>
                        </p>
                      </div>
                      <div className="text-sm space-y-1">
                        <span className="text-muted-foreground">Trial até:</span>
                        <p>{orgDetail.subscription?.trial_ends_at
                          ? new Date(orgDetail.subscription.trial_ends_at).toLocaleDateString("pt-BR")
                          : "—"}
                        </p>
                      </div>
                      <div className="text-sm space-y-1">
                        <span className="text-muted-foreground">Período atual até:</span>
                        <p>{orgDetail.subscription?.current_period_end
                          ? new Date(orgDetail.subscription.current_period_end).toLocaleDateString("pt-BR")
                          : "—"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Alterar status:</p>
                      <div className="flex flex-wrap gap-2">
                        {statusOptions.map((opt) => {
                          const isCurrent = orgDetail.subscription?.status === opt.value
                          return (
                            <Button
                              key={opt.value}
                              variant={isCurrent ? "default" : "outline"}
                              size="sm"
                              disabled={isCurrent || changingStatus === opt.value}
                              onClick={() => handleStatusChange(opt.value, `Alterado pelo admin para ${opt.label}`)}
                              className="text-xs"
                            >
                              {changingStatus === opt.value ? "Alterando..." : opt.label}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Usage */}
                  {orgDetail.usage && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 rounded-lg bg-muted/20">
                        <p className="text-xs text-muted-foreground">Projetos</p>
                        <p className="text-lg font-bold">{orgDetail.usage.projects_used}/{orgDetail.usage.projects_limit >= 999999 ? "∞" : orgDetail.usage.projects_limit}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/20">
                        <p className="text-xs text-muted-foreground">Assets</p>
                        <p className="text-lg font-bold">{formatBytes(orgDetail.usage.assets_used_bytes)}/{orgDetail.usage.assets_limit_label || formatBytes(orgDetail.usage.assets_limit_bytes)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/20">
                        <p className="text-xs text-muted-foreground">Visualizações</p>
                        <p className="text-lg font-bold flex items-center gap-1">
                          <Eye className="h-4 w-4 text-primary" />
                          {orgDetail.analytics.total_views}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/20">
                        <p className="text-xs text-muted-foreground">Cliques</p>
                        <p className="text-lg font-bold flex items-center gap-1">
                          <MousePointerClick className="h-4 w-4 text-primary" />
                          {orgDetail.analytics.total_clicks}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Members */}
                  <div>
                    <h3 className="font-semibold mb-3">Membros</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {orgDetail.organization?.organization_members?.map((member: any) => (
                        <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium shrink-0">
                            {(member.profiles?.name || "?")[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{member.profiles?.name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.profiles?.email || "—"}</p>
                            <Badge variant="secondary" className="mt-1 text-[10px]">
                              {member.role === "owner" ? "Proprietário" :
                               member.role === "admin" ? "Admin" :
                               member.role === "editor" ? "Editor" : "Visualizador"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Projects */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-primary" />
                      Projetos ({orgDetail.projects.length})
                    </h3>
                    <ScrollArea className="max-h-60">
                      <div className="space-y-2">
                        {orgDetail.projects.map((project: any) => (
                          <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                            <div>
                              <p className="text-sm font-medium">{project.name}</p>
                              <p className="text-xs text-muted-foreground">{project.type} — {project.views} views</p>
                            </div>
                            <Badge variant={project.status === "published" ? "success" : "secondary"}>
                              {project.status === "published" ? "Publicado" : "Rascunho"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Analytics */}
                  {orgDetail.analytics.total_events > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        Analytics — Últimos Eventos
                      </h3>
                      <ScrollArea className="max-h-48">
                        <div className="space-y-1">
                          {orgDetail.analytics.recent_events.map((event: any) => (
                            <div key={event.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/10">
                              <span className="font-medium">
                                {event.event_type === "view" ? "👁️ Visualização" :
                                 event.event_type === "click" ? "🖱️ Clique" :
                                 event.event_type === "button_click" ? "🔘 Botão" : event.event_type}
                              </span>
                              <span className="text-muted-foreground">
                                {event.country && event.city ? `${event.city}, ${event.country}` :
                                 event.country || event.city || "Localização desconhecida"}
                              </span>
                              <span className="text-muted-foreground">
                                {new Date(event.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Payments */}
                  {orgDetail.payments.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Pagamentos
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-muted-foreground">ID</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Valor</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Vencimento</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orgDetail.payments.map((payment: any) => (
                              <tr key={payment.id} className="border-b border-border/50">
                                <td className="py-2 px-2 font-mono">{payment.asaas_payment_id?.slice(0, 12)}...</td>
                                <td className="py-2 px-2">R$ {Number(payment.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="py-2 px-2 text-muted-foreground">
                                  {new Date(payment.due_date).toLocaleDateString("pt-BR")}
                                </td>
                                <td className="py-2 px-2">
                                  <Badge variant={statusVariant[payment.status] || "secondary"}>
                                    {payment.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">Erro ao carregar detalhes</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
