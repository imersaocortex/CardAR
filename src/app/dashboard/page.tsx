"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import {
  Plus, FolderKanban, Eye, Box, Crown, TrendingUp, ArrowRight, Clock,
  Globe, MousePointerClick, BarChart3, Download, FileText, Users,
  CheckCircle2, AlertTriangle, Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppShell } from "@/components/layout/app-shell"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/store/auth-store"
import { createClient } from "@/lib/supabase/client"
import { cn, mapProjectType, mapProjectStatus, formatBytes } from "@/lib/utils"

interface DashboardProject {
  id: string
  name: string
  type: string
  status: string
  views: number
  created_at: string
  updated_at: string
}

interface AnalyticsData {
  summary: { total_views: number; total_clicks: number; total_interactions: number; unique_sessions: number }
  country_breakdown: { country: string; count: number }[]
  city_breakdown: { city: string; count: number }[]
  views_by_day: Record<string, number>
  event_type_breakdown: Record<string, number>
  button_click_breakdown: Record<string, number>
}

export default function DashboardPage() {
  const router = useRouter()
  const { organization } = useAuthStore()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("todos")
  const [subscription, setSubscription] = useState<any>(null)
  const [usage, setUsage] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "reports">("overview")

  // Analytics state
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const user = (await supabase.auth.getUser()).data.user
      if (!user) return

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()

      if (!memberships) { setLoading(false); return }

      const orgId = memberships.organization_id

      const [projectsRes, subRes, usageRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, type, status, views, created_at, updated_at")
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(5),
        supabase
          .from("subscriptions")
          .select("*, plans(*)")
          .eq("organization_id", orgId)
          .single(),
        supabase
          .from("usage_limits")
          .select("*")
          .eq("organization_id", orgId)
          .single(),
      ])

      setProjects(projectsRes.data || [])
      setSubscription(subRes.data)
      setUsage(usageRes.data)
      setLoading(false)
    }
    load()
  }, [])

  const loadAnalytics = async (projectId: string) => {
    setSelectedProject(projectId)
    setLoadingAnalytics(true)
    try {
      const res = await fetch(`/api/analytics/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch {}
    setLoadingAnalytics(false)
  }

  const handleExportPDF = () => {
    window.print()
  }

  const metrics = [
    { label: "Projetos Criados", value: String(projects.length), change: "Total de projetos", icon: "folder" },
    {
      label: "Visualizações AR",
      value: projects.reduce((s, p) => s + p.views, 0).toLocaleString(),
      change: "Visualizações totais",
      icon: "eye",
    },
    { label: "Plano Atual", value: subscription?.plans?.name || "Starter", change: subscription?.plans?.name || "Starter", icon: "crown" },
  ]

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    folder: FolderKanban, eye: Eye, box: Box, crown: Crown,
  }

  const statusColors: Record<string, "success" | "warning" | "secondary"> = {
    published: "success", draft: "secondary", paused: "warning",
  }

  const filtered = filter === "todos" ? projects : projects.filter((p) => p.type === filter)
  const totalViews = projects.reduce((s, p) => s + p.views, 0)
  const projectsUsed = usage?.projects_used || 0
  const projectsLimit = usage?.projects_limit || 0
  const usagePercent = projectsLimit > 0 ? Math.round((projectsUsed / projectsLimit) * 100) : 0

  const project = selectedProject ? projects.find(p => p.id === selectedProject) : null

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
        {/* Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Visão geral dos seus projetos AR</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/50 rounded-lg p-1">
              <button
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeTab === "overview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground",
                )}
              >
                Visão Geral
              </button>
              <button
                onClick={() => setActiveTab("reports")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeTab === "reports" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground",
                )}
              >
                Relatórios
              </button>
            </div>
            <Button variant="gradient" asChild>
              <Link href="/projects">
                <Plus className="h-4 w-4" />
                Novo Projeto
              </Link>
            </Button>
          </div>
        </div>

        {activeTab === "overview" && (
          <>
            {/* Plan & Usage Widget */}
            <Card className="glass border-border/50 mb-6">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5">
                    <Crown className="h-8 w-8 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Plano</p>
                      <p className="font-bold text-lg">{subscription?.plans?.name || "Starter"}</p>
                      {subscription?.status === "trialing" && (
                        <Badge variant="secondary" className="text-[10px] mt-0.5">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Trial
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <FolderKanban className="h-3 w-3" />
                      Projetos
                    </p>
                    <p className="text-xl font-bold">{projectsUsed}/{projectsLimit >= 999999 ? "∞" : projectsLimit}</p>
                    {projectsLimit > 0 && (
                      <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${usagePercent >= 80 ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      Visualizações
                    </p>
                    <p className="text-xl font-bold">{totalViews.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Total acumulado</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      Status
                    </p>
                    <p className="text-xl font-bold capitalize">
                      {subscription?.status === "active" ? "Ativo" :
                       subscription?.status === "trialing" ? "Trial" :
                       subscription?.status === "past_due" ? "Vencido" :
                       subscription?.status === "canceled" ? "Cancelado" : "Inativo"}
                    </p>
                    {subscription?.status !== "active" && subscription?.status !== "trialing" && (
                      <Link href="/billing" className="text-[10px] text-primary underline mt-1 block">
                        Regularizar
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {metrics.map((metric, i) => {
                const Icon = iconMap[metric.icon] || FolderKanban
                return (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="glass border-border/50 hover:border-primary/20 transition-all">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">{metric.label}</p>
                            <p className="text-3xl font-bold">{metric.value}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-emerald-400" />
                              {metric.change}
                            </p>
                          </div>
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>

            {/* Recent Projects */}
            <Card className="glass border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Projetos Recentes</CardTitle>
                <div className="flex items-center gap-2">
                  {["todos", "business_card", "flyer_a4", "square_1x1"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-muted/50",
                      )}
                    >
                      {f === "todos" ? "Todos" : f === "business_card" ? "Cartão" : f === "flyer_a4" ? "Panfleto" : "Post"}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <div className="text-center py-12">
                    <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">Nenhum projeto encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((project) => (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                            <FolderKanban className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{project.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant={statusColors[project.status] || "secondary"}>
                                {mapProjectStatus(project.status)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{project.views} views</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(project.updated_at).toLocaleDateString("pt-BR")}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {filtered.length > 0 && (
                  <div className="mt-4 text-center">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/projects">
                        Ver todos os projetos
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <div className="space-y-6" ref={reportRef}>
            <Card className="glass border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Relatórios de Acesso
                  </CardTitle>
                  {analytics && (
                    <Button variant="outline" size="sm" onClick={handleExportPDF}>
                      <Download className="h-4 w-4 mr-1" />
                      Exportar PDF
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Crie um projeto para ver os relatórios de acesso.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Project selector */}
                    <div className="flex flex-wrap gap-2">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => loadAnalytics(p.id)}
                          className={cn(
                            "px-3 py-2 rounded-lg text-xs font-medium transition-all",
                            selectedProject === p.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>

                    {/* Analytics content */}
                    {loadingAnalytics ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    ) : analytics ? (
                      <div className="space-y-6" id="analytics-report">
                        {/* Report Header */}
                        <div className="text-center mb-4 print:mb-6">
                          <h2 className="text-xl font-bold">Relatório de Acesso</h2>
                          <p className="text-sm text-muted-foreground">{project?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Gerado em {new Date().toLocaleString("pt-BR")}
                          </p>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                            <Eye className="h-5 w-5 text-primary mb-2" />
                            <p className="text-2xl font-bold">{analytics.summary.total_views}</p>
                            <p className="text-xs text-muted-foreground">Visualizações</p>
                          </div>
                          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                            <MousePointerClick className="h-5 w-5 text-primary mb-2" />
                            <p className="text-2xl font-bold">{analytics.summary.total_clicks}</p>
                            <p className="text-xs text-muted-foreground">Cliques</p>
                          </div>
                          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                            <Users className="h-5 w-5 text-primary mb-2" />
                            <p className="text-2xl font-bold">{analytics.summary.unique_sessions}</p>
                            <p className="text-xs text-muted-foreground">Sessões únicas</p>
                          </div>
                          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                            <Globe className="h-5 w-5 text-primary mb-2" />
                            <p className="text-2xl font-bold">{analytics.country_breakdown.length}</p>
                            <p className="text-xs text-muted-foreground">Países</p>
                          </div>
                        </div>

                        {/* Location Data */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 rounded-lg bg-muted/20">
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary" />
                              Por País
                            </h3>
                            {analytics.country_breakdown.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum dado de localização</p>
                            ) : (
                              <div className="space-y-2">
                                {analytics.country_breakdown.slice(0, 10).map((item) => (
                                  <div key={item.country} className="flex items-center justify-between text-sm">
                                    <span>{item.country}</span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary rounded-full"
                                          style={{ width: `${(item.count / analytics.summary.total_views) * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-medium w-8 text-right">{item.count}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="p-4 rounded-lg bg-muted/20">
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary" />
                              Por Cidade
                            </h3>
                            {analytics.city_breakdown.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum dado de localização</p>
                            ) : (
                              <div className="space-y-2">
                                {analytics.city_breakdown.slice(0, 10).map((item) => (
                                  <div key={item.city} className="flex items-center justify-between text-sm">
                                    <span>{item.city}</span>
                                    <span className="text-xs text-muted-foreground">{item.count} acessos</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Event Type Breakdown */}
                        <div className="p-4 rounded-lg bg-muted/20">
                          <h3 className="text-sm font-semibold mb-3">Tipos de Evento</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(analytics.event_type_breakdown).map(([type, count]) => (
                              <div key={type} className="text-center p-3 rounded-lg bg-background/50">
                                <p className="text-lg font-bold">{count}</p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {type === "view" ? "Visualizações" :
                                   type === "click" ? "Cliques" :
                                   type === "button_click" ? "Botões" : type}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Button Clicks */}
                        {Object.keys(analytics.button_click_breakdown).length > 0 && (
                          <div className="p-4 rounded-lg bg-muted/20">
                            <h3 className="text-sm font-semibold mb-3">Cliques em Botões</h3>
                            <div className="space-y-2">
                              {Object.entries(analytics.button_click_breakdown).map(([label, count]) => (
                                <div key={label} className="flex items-center justify-between text-sm">
                                  <span>{label}</span>
                                  <span className="text-xs text-muted-foreground">{count} cliques</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Views by Day */}
                        {Object.keys(analytics.views_by_day).length > 0 && (
                          <div className="p-4 rounded-lg bg-muted/20">
                            <h3 className="text-sm font-semibold mb-3">Visualizações (últimos 30 dias)</h3>
                            <div className="flex items-end gap-1 h-24">
                              {Object.entries(analytics.views_by_day).slice(-14).map(([day, count]) => {
                                const maxVal = Math.max(...Object.values(analytics.views_by_day), 1)
                                const height = (count / maxVal) * 100
                                return (
                                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">{count}</span>
                                    <div
                                      className="w-full bg-primary rounded-sm"
                                      style={{ height: `${Math.max(height, 4)}%` }}
                                    />
                                    <span className="text-[8px] text-muted-foreground">
                                      {new Date(day).toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" })}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Selecione um projeto acima para ver os relatórios de acesso.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </motion.div>
    </AppShell>
  )
}
