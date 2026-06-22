"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Plus, Box, Video, Image, Search, X, Trash2, MoreHorizontal, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AppShell } from "@/components/layout/app-shell"
import { cn, formatBytes } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

interface Asset {
  id: string
  name: string
  category: string
  mime_type: string
  size_bytes: number
  public_url: string
  created_at: string
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  "3d": Box,
  video: Video,
  image: Image,
}

const categoryColors: Record<string, string> = {
  "3d": "bg-purple-500/10 text-purple-400",
  video: "bg-cyan-500/10 text-cyan-400",
  image: "bg-emerald-500/10 text-emerald-400",
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<string>("todos")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAssets()
  }, [])

  async function loadAssets() {
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
        .from("assets")
        .select("*")
        .eq("organization_id", memberships.organization_id)
        .order("created_at", { ascending: false })

      setAssets(data || [])
    }
    setLoading(false)
  }

  const filtered = assets.filter((a) => {
    if (filter !== "todos" && a.category !== filter) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const rawExt = file.name.split(".").pop() || ""
    const ext = rawExt.toLowerCase()

    const extMimeMap: Record<string, string> = {
      glb: "model/gltf-binary",
      gltf: "model/gltf+json",
    }
    const detectedMime = extMimeMap[ext] || file.type

    const isGLB = ext === "glb" || file.type === "model/gltf-binary"
    const isGLTF = ext === "gltf" || file.type === "model/gltf+json"
    const is3D = isGLB || isGLTF || file.type.startsWith("model/")
    const isVideo = file.type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)
    const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)

    if (!is3D && !isVideo && !isImage) {
      toast({ title: "Tipo de arquivo não suportado. Use .glb, .gltf, .mp4, .png, .jpg, .webp, .gif, .webm", variant: "destructive" })
      setUploading(false)
      return
    }

    const category = is3D ? "3d" : isVideo ? "video" : "image"
    const bucket = is3D ? "models-3d" : isVideo ? "videos" : "markers"
    const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, { contentType: detectedMime })

    if (uploadError) {
      toast({ title: uploadError.message, variant: "destructive" })
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath)

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (!membership) { setUploading(false); return }

    const { data, error: dbError } = await supabase
      .from("assets")
      .insert({
        organization_id: membership.organization_id,
        name: file.name,
        category,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: storagePath,
        public_url: publicUrl,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (dbError) {
      toast({ title: dbError.message, variant: "destructive" })
    } else if (data) {
      setAssets([data, ...assets])
      toast({ title: "Upload concluído" })
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    const { data: asset } = await supabase
      .from("assets")
      .select("storage_path, category")
      .eq("id", id)
      .single()

    if (asset) {
      const bucket = asset.category === "3d" ? "models-3d" : asset.category === "video" ? "videos" : "markers"
      await supabase.storage.from(bucket).remove([asset.storage_path])
    }

    await supabase.from("assets").delete().eq("id", id)
    setAssets(assets.filter((a) => a.id !== id))
    toast({ title: "Asset removido", variant: "destructive" })
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
            <h1 className="text-2xl font-bold">Assets</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {assets.length} arquivos na biblioteca
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,model/gltf-binary,model/gltf+json,.glb,.gltf,video/mp4,video/webm,video/quicktime,.mov"
              onChange={handleFileSelected}
            />
            <Button variant="gradient" onClick={handleUploadClick} disabled={uploading}>
              <Upload className="h-4 w-4" />
              {uploading ? "Enviando..." : "Upload"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar assets..."
              className="pl-10 bg-muted/50 border-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(["todos", "3d", "video", "image"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-muted/50"
                )}
              >
                {f === "todos" ? "Todos" : f === "3d" ? "3D" : f === "video" ? "Vídeos" : "Imagens"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Box className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum asset encontrado</h3>
            <p className="text-sm text-muted-foreground mb-6">Faça upload dos seus primeiros arquivos</p>
            <Button variant="gradient" onClick={handleUploadClick}>
              <Plus className="h-4 w-4" />
              Fazer Upload
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((asset) => {
              const Icon = categoryIcons[asset.category] || Box
              return (
                <motion.div
                  key={asset.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Card className="glass border-border/50 hover:border-primary/20 transition-all group">
                    <div className="h-32 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative">
                      <Icon className="h-10 w-10 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors" />
                      <Badge className={cn("absolute top-2 left-2", categoryColors[asset.category] || "")}>
                        {asset.category === "3d" ? "3D" : asset.category === "video" ? "MP4" : "Imagem"}
                      </Badge>
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(asset.size_bytes)} • {new Date(asset.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => window.open(asset.public_url, "_blank")}>
                              <Box className="h-4 w-4" /> Abrir
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(asset.id)}>
                              <Trash2 className="h-4 w-4" /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>
    </AppShell>
  )
}
