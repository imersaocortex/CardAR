"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Eye, TrendingUp, Calendar, BarChart3, Globe, Smartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface AnalyticsData {
  total_views: number
  top_projects: { name: string; views: number; slug: string }[]
  views_by_day: { date: string; count: number }[]
  views_by_type: Record<string, number>
  total_projects: number
  published_projects: number
  avg_views_per_project: number
  projects_with_views: number
}

export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/stats")
        const json = await res.json()

        const projects = json.projects || []
        const totalViews = json.summary?.total_views || projects.reduce((s: number, p: any) => s + (p.views || 0), 0)

        const topProjects = [...projects]
          .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
          .slice(0, 10)
          .map((p: any) => ({ name: p.name, views: p.views || 0, slug: p.slug }))

        const published = projects.filter((p: any) => p.status === "published").length
        const withViews = projects.filter((p: any) => (p.views || 0) > 0).length

        const typeMap: Record<string, number> = {}
        for (const p of projects) {
          typeMap[p.type] = (typeMap[p.type] || 0) + 1
        }

        const days: Record<string, number> = {}
        for (const p of projects) {
          if (p.created_at) {
            const day = p.created_at.substring(0, 10)
            days[day] = (days[day] || 0) + 1
          }
        }

        const viewsByDay = Object.entries(days)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, count]) => ({ date, count }))

        setData({
          total_views: totalViews,
          top_projects: topProjects,
          views_by_day: viewsByDay,
          views_by_type: typeMap,
          total_projects: projects.length,
          published_projects: published,
          avg_views_per_project: projects.length > 0 ? Math.round(totalViews / projects.length) : 0,
          projects_with_views: withViews,
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
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
    return <p className="text-muted-foreground">Erro ao carregar estatísticas</p>
  }

  const typeLabel: Record<string, string> = {
    business_card: "Cartão",
    flyer_a4: "Panfleto",
    square_1x1: "Post",
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total de Visualizações", value: data.total_views.toLocaleString(), icon: Eye, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Total de Projetos", value: data.total_projects.toString(), icon: BarChart3, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Média de Views/Projeto", value: data.avg_views_per_project.toLocaleString(), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Projetos com Visualizações", value: `${data.projects_with_views}/${data.total_projects}`, icon: Globe, color: "text-amber-500", bg: "bg-amber-500/10" },
          ].map((metric, i) => {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Projetos Mais Visualizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_projects.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Nenhum projeto com visualizações</p>
            ) : (
              <div className="space-y-3">
                {data.top_projects.map((project, i) => {
                  const maxViews = data.top_projects[0]?.views || 1
                  const barWidth = (project.views / maxViews) * 100
                  return (
                    <div key={project.slug} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{project.name}</span>
                        <span className="text-muted-foreground ml-2">{project.views.toLocaleString()} views</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Projetos por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.views_by_type).length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Nenhum projeto</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(data.views_by_type)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const total = data.total_projects || 1
                    const percent = Math.round((count / total) * 100)
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{typeLabel[type] || type}</span>
                          <span className="text-muted-foreground">{count} ({percent}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Criação de Projetos (últimos 30 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.views_by_day.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Nenhum dado disponível</p>
          ) : (
            <div className="flex gap-1 items-end h-32">
              {data.views_by_day.map((day) => {
                const maxCount = Math.max(...data.views_by_day.map((d) => d.count), 1)
                const height = (day.count / maxCount) * 100
                const date = new Date(day.date)
                const label = `${date.getDate()}/${date.getMonth() + 1}`
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">{day.count || ""}</span>
                    <div
                      className="w-full bg-primary/20 rounded-t-sm hover:bg-primary/30 transition-colors cursor-pointer relative"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${label}: ${day.count} projetos`}
                    >
                      <div
                        className="absolute bottom-0 w-full bg-primary rounded-t-sm"
                        style={{ height: `${Math.max(height, 2)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Resumo da Plataforma
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Projetos Publicados", value: data.published_projects, total: data.total_projects },
              { label: "Taxa de Publicação", value: `${data.total_projects > 0 ? Math.round((data.published_projects / data.total_projects) * 100) : 0}%` },
              { label: "Projetos com Views", value: data.projects_with_views, total: data.total_projects },
              { label: "Engajamento", value: `${data.total_projects > 0 ? Math.round((data.projects_with_views / data.total_projects) * 100) : 0}%` },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-lg bg-muted/20 text-center">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
