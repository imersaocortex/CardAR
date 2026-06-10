"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, FolderKanban, MoreHorizontal, Copy, Eye, Pause, Play, Trash2, Search, X, Upload, FileImage, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AppShell } from "@/components/layout/app-shell"
import { cn, mapProjectStatus } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { createProject, deleteProject } from "@/lib/actions/projects"

interface Project {
  id: string
  name: string
  type: string
  status: string
  slug: string
  views: number
  created_at: string
  updated_at: string
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("todos")
  const [search, setSearch] = useState("")
  const [showNewModal, setShowNewModal] = useState(false)
  const [newProject, setNewProject] = useState({ name: "", type: "business_card" })
  const [creating, setCreating] = useState(false)
  const [markerFile, setMarkerFile] = useState<File | null>(null)
  const [markerPreview, setMarkerPreview] = useState<string | null>(null)
  const [subSuspended, setSubSuspended] = useState(false)
  const markerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (memberships) {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .eq("organization_id", memberships.organization_id)
        .order("updated_at", { ascending: false })

      setProjects(data || [])

      // Check subscription status
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("organization_id", memberships.organization_id)
        .single()

      setSubSuspended(sub ? (sub.status === "past_due" || sub.status === "canceled") : false)
    }
    setLoading(false)
  }

  const filtered = projects.filter((p) => {
    if (filter !== "todos" && p.type !== filter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleCreate = async () => {
    setCreating(true)
    const supabase = createClient()

    const formData = new FormData()
    formData.append("name", newProject.name || "Novo Projeto")
    formData.append("type", newProject.type)

    const result = await createProject(formData)

    if (result.error) {
      toast({ title: result.error, variant: "destructive" })
      setCreating(false)
      return
    }

    if (result.data) {
      // Upload marker image if provided
      if (markerFile) {
        const ext = markerFile.name.endsWith(".png") ? "png" : "jpg"
        const fileName = `marker_${result.data.id}_${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from("markers")
          .upload(fileName, markerFile, { upsert: true })

        if (!uploadError) {
          const { data: urlData } = await supabase.storage
            .from("markers")
            .getPublicUrl(fileName)

          if (urlData?.publicUrl) {
            await supabase.from("project_markers").upsert({
              project_id: result.data.id,
              image_url: urlData.publicUrl,
              width: 0,
              height: 0,
            }, { onConflict: "project_id" })
          }
        }
      }

      loadProjects()
    }

    setShowNewModal(false)
    setNewProject({ name: "", type: "business_card" })
    setMarkerFile(null)
    setMarkerPreview(null)
    setCreating(false)
  }

  const handleDuplicate = async (project: Project) => {
    const formData = new FormData()
    formData.append("name", `${project.name} (cópia)`)
    formData.append("type", project.type)

    const result = await createProject(formData)

    if (result.error) {
      toast({ title: result.error, variant: "destructive" })
    } else {
      toast({ title: "Projeto duplicado" })
      loadProjects()
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    const supabase = createClient()
    await supabase.from("projects").update({ status }).eq("id", id)
    setProjects(projects.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  const handleDelete = async (id: string) => {
    const result = await deleteProject(id)
    if (result.error) {
      toast({ title: result.error, variant: "destructive" })
    } else {
      toast({ title: "Projeto removido" })
      loadProjects()
    }
  }

  const statusColors: Record<string, "success" | "secondary" | "warning" | "destructive"> = {
    published: "success",
    draft: "secondary",
    paused: "warning",
    suspended: "destructive",
  }

  const typeLabels: Record<string, string> = {
    business_card: "Cartão de Visita",
    flyer_a4: "Panfleto A4",
    square_1x1: "Post 1x1",
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Projetos</h1>
            <p className="text-muted-foreground text-sm mt-1">{projects.length} projetos criados</p>
          </div>
          {subSuspended && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Assinatura vencida — projetos suspensos</span>
            </div>
          )}
          <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
            <DialogTrigger asChild>
              <Button variant="gradient" disabled={subSuspended}>
                <Plus className="h-4 w-4" />
                Novo Projeto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Projeto</DialogTitle>
                <DialogDescription>Crie uma nova experiência de realidade aumentada.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="proj-name">Nome do Projeto</Label>
                  <Input
                    id="proj-name"
                    placeholder="Ex: Cartão João Construtor"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proj-type">Tipo</Label>
                  <Select
                    value={newProject.type}
                    onValueChange={(v) => setNewProject({ ...newProject, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business_card">Cartão de Visita</SelectItem>
                      <SelectItem value="flyer_a4">Panfleto A4</SelectItem>
                      <SelectItem value="square_1x1">Post 1x1</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Marcador de Imagem (para tracking AR)</Label>
                  <div
                    onClick={() => markerInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
                  >
                    {markerPreview ? (
                      <div className="flex flex-col items-center gap-2">
                        <img src={markerPreview} alt="Preview" className="max-h-32 rounded-lg object-contain" />
                        <p className="text-xs text-muted-foreground">{markerFile?.name}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                          <FileImage className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">Clique para selecionar imagem</p>
                        <p className="text-xs text-muted-foreground/60">PNG ou JPEG • Máx 10MB</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={markerInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          toast({ title: "Arquivo muito grande", description: "Máximo 10MB", variant: "destructive" })
                          return
                        }
                        setMarkerFile(file)
                        setMarkerPreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                  {markerPreview && (
                    <button
                      onClick={() => { setMarkerFile(null); setMarkerPreview(null) }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remover imagem
                    </button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewModal(false)}>Cancelar</Button>
                <Button variant="gradient" onClick={handleCreate} disabled={creating}>
                  {creating ? "Criando..." : "Criar Projeto"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos..."
              className="pl-10 bg-muted/50 border-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(["todos", "business_card", "flyer_a4", "square_1x1"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-muted/50"
                )}
              >
                {f === "todos" ? "Todos" : typeLabels[f] || f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum projeto encontrado</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search ? "Tente buscar por outro termo" : "Crie seu primeiro projeto AR"}
            </p>
            {!search && (
              <Button variant="gradient" onClick={() => setShowNewModal(true)}>
                <Plus className="h-4 w-4" />
                Criar Projeto
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filtered.map((project) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card
                    className="glass border-border/50 hover:border-primary/20 transition-all cursor-pointer group overflow-hidden"
                  >
                    <div
                      className="h-40 bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/5 flex items-center justify-center relative"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <FolderKanban className="h-12 w-12 text-primary/30 group-hover:text-primary/50 transition-colors" />
                      <Badge
                        variant={statusColors[project.status]}
                        className="absolute top-3 left-3"
                      >
                        {mapProjectStatus(project.status)}
                      </Badge>
                      <span className="absolute top-3 right-3 text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded-md">
                        {typeLabels[project.type] || project.type}
                      </span>
                    </div>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0" onClick={() => router.push(`/projects/${project.id}`)}>
                          <p className="font-medium text-sm truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {project.views} visualizações • {new Date(project.updated_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push(`/projects/${project.id}`)}>
                              <Eye className="h-4 w-4" /> Abrir
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(project)}>
                              <Copy className="h-4 w-4" /> Duplicar
                            </DropdownMenuItem>
                            {project.status === "draft" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(project.id, "published")}>
                                <Play className="h-4 w-4" /> Publicar
                              </DropdownMenuItem>
                            )}
                            {project.status === "published" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(project.id, "paused")}>
                                <Pause className="h-4 w-4" /> Pausar
                              </DropdownMenuItem>
                            )}
                            {project.status === "paused" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(project.id, "published")}>
                                <Play className="h-4 w-4" /> Reativar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(project.id)}
                            >
                              <Trash2 className="h-4 w-4" /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AppShell>
  )
}
