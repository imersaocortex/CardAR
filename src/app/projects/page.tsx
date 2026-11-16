"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, FolderKanban, MoreHorizontal, Copy, Eye, Pause, Play, Trash2, Search, X, FileImage, AlertTriangle, LayoutGrid, List } from "lucide-react"
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
import Link from "next/link"
import { toast } from "@/hooks/use-toast"
import { createProject, deleteProject } from "@/lib/actions/projects"

interface Project {
  id: string
  name: string
  type: string
  tracking_mode: "marker" | "surface" | "gps"
  latitude: number | null
  longitude: number | null
  activation_radius: number
  status: string
  slug: string
  views: number
  created_at: string
  updated_at: string
}

const projectStatuses = [
  { value: "published", label: "Publicado" },
  { value: "draft", label: "Rascunho" },
  { value: "paused", label: "Pausado" },
  { value: "suspended", label: "Suspenso" },
  { value: "archived", label: "Arquivado" },
] as const

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("todos")
  const [statusFilter, setStatusFilter] = useState("todos")
  const [view, setView] = useState<"cards" | "list">("cards")
  const [search, setSearch] = useState("")
  const [showNewModal, setShowNewModal] = useState(false)
  const [newProject, setNewProject] = useState({ name: "", type: "business_card", trackingMode: "marker", latitude: "", longitude: "", activationRadius: "100" })
  const [creating, setCreating] = useState(false)
  const [markerFile, setMarkerFile] = useState<File | null>(null)
  const [markerPreview, setMarkerPreview] = useState<string | null>(null)
  const [subSuspended, setSubSuspended] = useState(false)
  const [trackingAccess, setTrackingAccess] = useState({ gps: false, surface: false })
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
        .select("status, plans(gps_enabled, surface_enabled)")
        .eq("organization_id", memberships.organization_id)
        .single()

      setSubSuspended(sub ? (sub.status === "past_due" || sub.status === "canceled") : false)
      const plan = Array.isArray(sub?.plans) ? sub.plans[0] : sub?.plans
      setTrackingAccess({ gps: plan?.gps_enabled === true, surface: plan?.surface_enabled === true })
    }
    setLoading(false)
  }

  const query = search.trim().toLowerCase()
  const filtered = projects.filter((p) => {
    if (filter !== "todos" && p.type !== filter) return false
    if (statusFilter !== "todos" && p.status !== statusFilter) return false
    if (query && !p.name.toLowerCase().includes(query)) return false
    return true
  })

  const handleCreate = async () => {
    setCreating(true)
    const supabase = createClient()

    const formData = new FormData()
    formData.append("name", newProject.name || "Novo Projeto")
    formData.append("type", newProject.type)
    formData.append("tracking_mode", newProject.trackingMode)
    if (newProject.trackingMode === "gps") {
      formData.append("latitude", newProject.latitude)
      formData.append("longitude", newProject.longitude)
      formData.append("activation_radius", newProject.activationRadius)
    }

    const result = await createProject(formData)

    if (result.error) {
      toast({ title: result.error, variant: "destructive" })
      setCreating(false)
      return
    }

    if (result.data) {
      // Upload marker image if provided
      if (newProject.trackingMode === "marker" && markerFile) {
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
    setNewProject({ name: "", type: "business_card", trackingMode: "marker", latitude: "", longitude: "", activationRadius: "100" })
    setMarkerFile(null)
    setMarkerPreview(null)
    setCreating(false)
  }

  const handleDuplicate = async (project: Project) => {
    const supabase = createClient()

    const formData = new FormData()
    formData.append("name", `${project.name} (cópia)`)
    formData.append("type", project.type)
    formData.append("tracking_mode", project.tracking_mode || "marker")
    if (project.tracking_mode === "gps") {
      formData.append("latitude", String(project.latitude ?? ""))
      formData.append("longitude", String(project.longitude ?? ""))
      formData.append("activation_radius", String(project.activation_radius ?? 100))
    }

    const result = await createProject(formData)

    if (result.error) {
      toast({ title: result.error, variant: "destructive" })
      return
    }

    const newProject = result.data
    if (newProject?.id && project.id !== newProject.id) {
      try {
        // Copy scene + objects + buttons
        const { data: scenes } = await supabase
          .from("scenes")
          .select("*, scene_objects(*, scene_buttons(*))")
          .eq("project_id", project.id)
          .order("created_at")
          .limit(1)

        if (scenes?.[0]) {
          const srcScene = scenes[0]
          const { data: newScene } = await supabase
            .from("scenes")
            .insert({
              project_id: newProject.id,
              name: srcScene.name || "Cena Principal",
              background_color: srcScene.background_color || "#000000",
              lighting_config: srcScene.lighting_config || {},
              camera_config: srcScene.camera_config || {},
            })
            .select()
            .single()

          if (newScene && srcScene.scene_objects?.length) {
            for (const obj of srcScene.scene_objects) {
              const { data: newObj } = await supabase
                .from("scene_objects")
                .insert({
                  scene_id: newScene.id,
                  type: obj.type,
                  name: obj.name,
                  position_x: obj.position_x,
                  position_y: obj.position_y,
                  position_z: obj.position_z,
                  rotation_x: obj.rotation_x,
                  rotation_y: obj.rotation_y,
                  rotation_z: obj.rotation_z,
                  scale_x: obj.scale_x,
                  scale_y: obj.scale_y,
                  scale_z: obj.scale_z,
                  opacity: obj.opacity,
                  visible: obj.visible,
                  layer_order: obj.layer_order,
                  animation_type: obj.animation_type,
                  action: obj.action,
                  asset_url: obj.asset_url,
                  asset_thumbnail: obj.asset_thumbnail,
                  show_caption: obj.show_caption,
                  face_camera: obj.face_camera ?? false,
                  chroma_key_color: obj.chroma_key_color,
                  chroma_key_tolerance: obj.chroma_key_tolerance,
                  chroma_key_smoothness: obj.chroma_key_smoothness,
                  duration: obj.duration,
                })
                .select()
                .single()

              if (newObj && obj.scene_buttons?.length) {
                for (const btn of obj.scene_buttons) {
                  await supabase.from("scene_buttons").insert({
                    scene_object_id: newObj.id,
                    label: btn.label,
                    icon: btn.icon,
                    action_type: btn.action_type,
                    action_value: btn.action_value,
                  })
                }
              }
            }
          }
        }

        // Copy marker
        const { data: marker } = await supabase
          .from("project_markers")
          .select("*")
          .eq("project_id", project.id)
          .maybeSingle()

        if (marker) {
          await supabase.from("project_markers").insert({
            project_id: newProject.id,
            image_url: marker.image_url,
            target_url: marker.target_url,
            width: marker.width,
            height: marker.height,
          })
        }
      } catch (e) {
        console.error("[duplicate] failed to copy scene/marker:", e)
      }
    }

    toast({ title: "Projeto duplicado" })
    loadProjects()
  }

  const handleStatusChange = async (id: string, status: string) => {
    const supabase = createClient()
    const { data, error } = await supabase.from("projects").update({ status }).eq("id", id).select("status").single()
    if (error || !data) {
      toast({ title: "Não foi possível atualizar o status", variant: "destructive" })
      return
    }
    setProjects((current) => current.map((p) => (p.id === id ? { ...p, status: data.status } : p)))
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
    archived: "secondary",
  }

  const typeLabels: Record<string, string> = {
    business_card: "Cartão de Visita",
    flyer_a4: "Panfleto A4",
    square_1x1: "Post 1x1",
  }
  const trackingLabels: Record<string, string> = {
    marker: "Imagem / marcador",
    surface: "Superfície",
    gps: "GPS",
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
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold">Projetos</h1>
            <p className="text-muted-foreground text-sm mt-1">{projects.length} projetos criados</p>
          </div>
          {subSuspended && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Assinatura vencida — projetos suspensos</span>
            </div>
          )}
          <Button variant="outline" asChild><Link href="/projects/collections">Vários projetos em uma URL</Link></Button>
          <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
            <DialogTrigger asChild>
              <Button variant="gradient" disabled={subSuspended}>
                <Plus className="h-4 w-4" />
                Novo Projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                  <Label htmlFor="proj-tracking">Modo de realidade aumentada</Label>
                  <select
                    id="proj-tracking"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newProject.trackingMode}
                    onChange={(event) => setNewProject({ ...newProject, trackingMode: event.target.value })}
                  >
                    <option value="marker">Imagem / marcador</option>
                    <option value="surface" disabled={!trackingAccess.surface}>Superfície: chão ou mesa{trackingAccess.surface ? "" : " · indisponível no plano"}</option>
                    <option value="gps" disabled={!trackingAccess.gps}>GPS: direção das coordenadas{trackingAccess.gps ? "" : " · indisponível no plano"}</option>
                  </select>
                  {newProject.trackingMode === "surface" && <p className="text-xs text-muted-foreground">Posicione a cena em uma superfície plana. Requer celular compatível com WebXR AR.</p>}
                  {newProject.trackingMode === "gps" && <p className="text-xs text-muted-foreground">O objeto aparecerá na direção do ponto configurado. GPS e bússola são necessários.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proj-type">Formato do projeto</Label>
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
                {newProject.trackingMode === "gps" && <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="proj-latitude">Latitude</Label>
                    <Input id="proj-latitude" type="number" step="any" min="-90" max="90" placeholder="Ex: -23.5505" value={newProject.latitude} onChange={(e) => setNewProject({ ...newProject, latitude: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proj-longitude">Longitude</Label>
                    <Input id="proj-longitude" type="number" step="any" min="-180" max="180" placeholder="Ex: -46.6333" value={newProject.longitude} onChange={(e) => setNewProject({ ...newProject, longitude: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proj-radius">Raio de proximidade (metros)</Label>
                    <Input id="proj-radius" type="number" min="10" max="5000" value={newProject.activationRadius} onChange={(e) => setNewProject({ ...newProject, activationRadius: e.target.value })} />
                    <p className="text-xs text-muted-foreground">O objeto aparece apenas quando o visitante está dentro deste raio. Seu tamanho varia conforme a distância real do celular até o ponto.</p>
                  </div>
                  <Button variant="outline" type="button" onClick={() => navigator.geolocation?.getCurrentPosition(({ coords }) => setNewProject((current) => ({ ...current, latitude: String(coords.latitude), longitude: String(coords.longitude) })), () => toast({ title: "Não foi possível obter sua localização", variant: "destructive" }), { enableHighAccuracy: true, timeout: 15000 })}>Usar minha localização</Button>
                </div>}
                {newProject.trackingMode === "marker" && <div className="space-y-2">
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
                </div>}
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

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-xs sm:flex-1 sm:basis-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos..."
              aria-label="Buscar projetos"
              className="border-0 bg-muted/50 pl-10 pr-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Filtrar por formato"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os formatos</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {projectStatuses.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div role="group" aria-label="Visualização dos projetos" className="flex gap-1 rounded-lg border border-border p-1 sm:ml-auto">
            <Button type="button" size="sm" variant={view === "cards" ? "secondary" : "ghost"} aria-pressed={view === "cards"} onClick={() => setView("cards")}>
              <LayoutGrid className="h-4 w-4" /> Cartões
            </Button>
            <Button type="button" size="sm" variant={view === "list" ? "secondary" : "ghost"} aria-pressed={view === "list"} onClick={() => setView("list")}>
              <List className="h-4 w-4" /> Lista
            </Button>
          </div>
        </div>

        {projects.length > 0 && <p role="status" className="mb-3 text-xs text-muted-foreground">
          {filtered.length} de {projects.length} {projects.length === 1 ? "projeto" : "projetos"}
        </p>}
        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum projeto encontrado</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {projects.length > 0 ? "Ajuste a busca ou limpe os filtros para ver outros projetos." : "Crie seu primeiro projeto AR."}
            </p>
            {projects.length > 0 ? (
              <Button variant="outline" onClick={() => { setSearch(""); setFilter("todos"); setStatusFilter("todos") }}>Limpar filtros</Button>
            ) : (
              <Button variant="gradient" disabled={subSuspended} onClick={() => setShowNewModal(true)}>
                <Plus className="h-4 w-4" />
                Criar Projeto
              </Button>
            )}
          </div>
        ) : (
          <ul className={cn("grid grid-cols-1", view === "cards" ? "gap-4 md:grid-cols-2 lg:grid-cols-3" : "gap-2")}>
            <AnimatePresence>
              {filtered.map((project) => (
                <motion.li
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card className={cn("glass group overflow-hidden border-border/50 transition-colors hover:border-primary/30", view === "list" && "flex items-center px-3 sm:px-4")}>
                    {view === "cards" ? <Link
                      href={`/projects/${project.id}`}
                      aria-label={`Abrir ${project.name}`}
                      className="relative flex h-40 items-center justify-center bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/5"
                    >
                      <FolderKanban className="h-12 w-12 text-primary/30 group-hover:text-primary/50 transition-colors" />
                      <Badge
                        variant={statusColors[project.status]}
                        className="absolute left-3 top-3 capitalize"
                      >
                        {mapProjectStatus(project.status)}
                      </Badge>
                      <span className="absolute top-3 right-3 text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded-md">
                        {typeLabels[project.type] || project.type}
                      </span>
                      <span className="absolute bottom-3 left-3 text-xs text-foreground bg-card/80 px-2 py-1 rounded-md">
                        {trackingLabels[project.tracking_mode || "marker"] || "Imagem / marcador"}
                      </span>
                    </Link> : <div className="hidden size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:grid">
                      <FolderKanban className="size-5" aria-hidden="true" />
                    </div>}
                    <CardContent className={cn("min-w-0 flex-1 p-4", view === "list" && "px-0 py-3 sm:pl-3")}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/projects/${project.id}`} className="min-w-0 flex-1 rounded-sm hover:text-primary">
                          <p className="truncate text-sm font-medium">{project.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {view === "list" && <>{typeLabels[project.type] || project.type} · {trackingLabels[project.tracking_mode] ?? trackingLabels.marker} · </>}
                            {project.views} visualizações · {new Date(project.updated_at).toLocaleDateString("pt-BR")}
                          </p>
                        </Link>
                        {view === "list" && <Badge variant={statusColors[project.status]} className="shrink-0 capitalize">{mapProjectStatus(project.status)}</Badge>}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Ações de ${project.name}`}>
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
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </motion.div>
    </AppShell>
  )
}
