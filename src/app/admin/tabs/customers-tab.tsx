"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Users, FolderKanban, CreditCard } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

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

export function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const loadCustomers = async (q: string) => {
    setLoading(true)
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : ""
      const res = await fetch(`/api/admin/customers${params}`)
      const data = await res.json()
      setCustomers(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
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
                <Button type="submit" variant="secondary" size="sm">
                  Buscar
                </Button>
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
                    {customers.length === 0 && (
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
                      const assetPercent = usage
                        ? Math.round((usage.assets_used_bytes / Math.max(usage.assets_limit_bytes, 1)) * 100)
                        : 0

                      return (
                        <tr
                          key={customer.id}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setSelectedCustomer(
                            selectedCustomer?.id === customer.id ? null : customer,
                          )}
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
                                <span>
                                  {usage?.projects_used || 0}/{usage?.projects_limit || 0}
                                </span>
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

      {selectedCustomer && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {selectedCustomer.name} — Membros
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCustomer.organization_members.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum membro</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedCustomer.organization_members.map((member) => (
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
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
