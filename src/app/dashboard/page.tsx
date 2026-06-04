"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, FolderKanban, Eye, Box, Crown, TrendingUp, ArrowRight, Clock } from "lucide-react"
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

export default function DashboardPage() {
  const router = useRouter()
  const { profile, organization } = useAuthStore()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("todos")

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .limit(1)
        .single()

      if (memberships) {
        const { data } = await supabase
          .from("projects")
          .select("id, name, type, status, views, created_at, updated_at")
          .eq("organization_id", memberships.organization_id)
          .order("updated_at", { ascending: false })
          .limit(5)

        setProjects(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const metrics = [
    { label: "Projetos Criados", value: String(projects.length), change: "Total de projetos", icon: "folder" },
    { label: "Visualizações AR", value: projects.reduce((s, p) => s + p.views, 0).toLocaleString(), change: "Visualizações totais", icon: "eye" },
    { label: "Plano Atual", value: organization?.name || "Starter", change: "Faça upgrade para mais recursos", icon: "crown" },
  ]

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    folder: FolderKanban,
    eye: Eye,
    box: Box,
    crown: Crown,
  }

  const statusColors: Record<string, "success" | "warning" | "secondary"> = {
    published: "success",
    draft: "secondary",
    paused: "warning",
  }

  const filtered = filter === "todos" ? projects : projects.filter((p) => p.type === filter)

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Visão geral dos seus projetos AR</p>
          </div>
          <Button variant="gradient" asChild>
            <Link href="/projects">
              <Plus className="h-4 w-4" />
              Novo Projeto
            </Link>
          </Button>
        </div>

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
                    filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-muted/50"
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
      </motion.div>
    </AppShell>
  )
}
