"use client"

import { useState, useEffect } from "react"
import {
  Box, Video, Camera, Search, Plus, Cuboid, Upload, FileUp, Square, Image, Music
} from "lucide-react"

function WhatsAppIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#25D366" />
      <path d="M24 10C16.268 10 10 16.268 10 24c0 3.03.88 5.86 2.4 8.26L10 38l5.84-2.36A13.94 13.94 0 0024 38c7.732 0 14-6.268 14-14S31.732 10 24 10zm6.46 16.36c-.36-.18-2.12-1.04-2.46-1.16-.32-.12-.56-.18-.8.18-.24.34-.94 1.16-1.14 1.4-.22.24-.44.26-.8.08-.36-.18-1.52-.56-2.9-1.8-1.06-.96-1.78-2.14-1.98-2.5-.2-.36-.02-.56.16-.74.16-.16.36-.42.54-.64.18-.2.24-.36.36-.6.12-.24.06-.44-.02-.62-.08-.18-.8-1.94-1.1-2.66-.3-.72-.6-.6-.8-.6-.2 0-.44-.02-.68-.02-.24 0-.62.08-.96.42-.34.34-1.28 1.26-1.28 3.08 0 1.8 1.32 3.56 1.5 3.8.18.24 2.6 3.96 6.3 5.56.88.38 1.56.6 2.1.78.88.28 1.68.24 2.32.14.7-.1 2.12-.86 2.42-1.7.3-.84.3-1.56.22-1.7-.1-.18-.3-.28-.66-.46z" fill="white" />
    </svg>
  )
}

function InstagramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none">
      <defs>
        <linearGradient id="ig" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#FFDC80" />
          <stop offset="0.5" stopColor="#F77737" />
          <stop offset="1" stopColor="#E1306C" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#ig)" />
      <rect x="14" y="14" width="20" height="20" rx="4" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="24" cy="24" r="5" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="30" cy="18" r="1.5" fill="white" />
    </svg>
  )
}

function GlobeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#3b82f6" />
      <circle cx="24" cy="24" r="10" fill="none" stroke="white" strokeWidth="2" />
      <ellipse cx="24" cy="24" rx="15" ry="8" fill="none" stroke="white" strokeWidth="2" />
      <line x1="10" y1="24" x2="38" y2="24" stroke="white" strokeWidth="2" />
    </svg>
  )
}

function PhoneIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#22c55e" />
      <path d="M34.5 29.7l-4.2-1.8c-.5-.2-1.1-.1-1.5.3l-1.9 2.3c-2.9-1.5-5.3-3.9-6.8-6.8l2.3-1.9c.4-.4.5-.9.3-1.5L21 13.5c-.3-.7-1-1.1-1.7-.9l-4.8 1.2c-.7.2-1.1.8-1.1 1.5C13.4 25.8 22.2 34.6 33 35.6c.7 0 1.3-.4 1.5-1.1l1.2-4.8c.2-.7-.2-1.4-.9-1.7z" fill="white" stroke="white" strokeWidth="1.5" />
    </svg>
  )
}

function EmailIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#ef4444" />
      <rect x="10" y="16" width="28" height="16" rx="2" fill="none" stroke="white" strokeWidth="2" />
      <polyline points="10,16 24,26 38,16" fill="none" stroke="white" strokeWidth="2" />
    </svg>
  )
}
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useStudioStore } from "@/store"
import { ElementType, StudioElement } from "@/types"
import { toast } from "@/hooks/use-toast"

interface ElementLibraryItem {
  type: ElementType
  name: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  category: "botoes" | "midia"
}

const elementLibrary: ElementLibraryItem[] = [
  { type: "modelo-3d", name: "Modelo 3D", icon: Box, color: "#7c3aed", category: "midia" },
  { type: "modelo-3d-animado", name: "Modelo 3D Animado", icon: Cuboid, color: "#06b6d4", category: "midia" },
  { type: "video-mp4", name: "Vídeo MP4", icon: Video, color: "#3b82f6", category: "midia" },
  { type: "video-chromakey", name: "Vídeo Chromakey", icon: Camera, color: "#22c55e", category: "midia" },
  { type: "imagem", name: "Imagem", icon: Image, color: "#f59e0b", category: "midia" },
  { type: "audio", name: "Áudio", icon: Music, color: "#ec4899", category: "midia" },
  { type: "botao-whatsapp", name: "WhatsApp", icon: WhatsAppIcon, color: "#25D366", category: "botoes" },
  { type: "botao-site", name: "Site", icon: GlobeIcon, color: "#3b82f6", category: "botoes" },
  { type: "botao-instagram", name: "Instagram", icon: InstagramIcon, color: "#E4405F", category: "botoes" },
  { type: "botao-ligar", name: "Ligar", icon: PhoneIcon, color: "#22c55e", category: "botoes" },
  { type: "botao-email", name: "E-mail", icon: EmailIcon, color: "#ef4444", category: "botoes" },
]

const readyAssets = [
  { name: "Botão WhatsApp", type: "botao-whatsapp" as ElementType, color: "#25D366", icon: WhatsAppIcon },
  { name: "Botão Instagram", type: "botao-instagram" as ElementType, color: "#E4405F", icon: InstagramIcon },
  { name: "Botão Site", type: "botao-site" as ElementType, color: "#3b82f6", icon: GlobeIcon },
  { name: "Botão Telefone", type: "botao-ligar" as ElementType, color: "#22c55e", icon: PhoneIcon },
  { name: "Botão E-mail", type: "botao-email" as ElementType, color: "#ef4444", icon: EmailIcon },
]

interface AssetItem {
  id: string
  name: string
  category: "3d" | "video" | "image"
  public_url: string
  mime_type: string
}

export function StudioSidebar() {
  const [search, setSearch] = useState("")
  const [uploadCategory, setUploadCategory] = useState<"3d" | "video" | "image">("3d")
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState("")
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const { addElement, elements } = useStudioStore()

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAssets(data)
      })
      .catch(() => {})
      .finally(() => setAssetsLoading(false))
  }, [])

  const filtered = elementLibrary.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  const botoes = filtered.filter((i) => i.category === "botoes")
  const midia = filtered.filter((i) => i.category === "midia")

  const handleAddElement = (item: ElementLibraryItem) => {
    const isVideo = item.type === "video-mp4" || item.type === "video-chromakey"
    const defaultUrl = item.type === "video-chromakey" ? "/chormakey-default.mp4" : "/mp4-default.mp4"
    const newEl: StudioElement = {
      id: `el_${Date.now()}`,
      type: item.type,
      name: item.name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      opacity: 1,
      duration: 2,
      visible: true,
      assetUrl: isVideo ? defaultUrl : undefined,
    }
    addElement(newEl)
    toast({ title: `${item.name} adicionado`, description: "Use o painel de propriedades para ajustar." })
  }

  const handleAddAsset = (asset: AssetItem) => {
    const typeMap: Record<string, ElementType> = {
      "3d": "modelo-3d",
      video: "video-mp4",
      image: "imagem",
    }
    const newEl: StudioElement = {
      id: `el_${Date.now()}`,
      type: typeMap[asset.category] || "modelo-3d",
      name: asset.name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      opacity: 1,
      duration: asset.category === "video" ? 5 : 0,
      visible: true,
      assetUrl: asset.public_url,
    }
    addElement(newEl)
    toast({ title: `"${asset.name}" adicionado`, description: "Asset adicionado à cena." })
  }

  const handleAddReadyAsset = (asset: typeof readyAssets[0]) => {
    const newEl: StudioElement = {
      id: `el_${Date.now()}`,
      type: asset.type,
      name: asset.name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      opacity: 1,
      duration: 0,
      visible: true,
    }
    addElement(newEl)
    toast({ title: `${asset.name} adicionado`, description: "Pronto para usar na cena." })
  }

  const handleFakeUpload = () => {
    const fileInput = document.createElement("input")
    fileInput.type = "file"
    const extMap: Record<string, string> = { "3d": ".glb,.gltf", video: ".mp4,.mov,.webm", image: ".png,.jpg,.jpeg" }
    fileInput.accept = extMap[uploadCategory] || "*"
    fileInput.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const name = file.name.replace(/\.[^/.]+$/, "")
      setUploadedFileName(file.name)

      const typeMap: Record<string, ElementType> = {
        "3d": "modelo-3d",
        video: "video-mp4",
        image: "imagem",
      }

      const newEl: StudioElement = {
        id: `el_${Date.now()}`,
        type: typeMap[uploadCategory],
        name: name,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        opacity: 1,
        duration: uploadCategory === "video" ? 5 : 0,
        visible: true,
        assetUrl: URL.createObjectURL(file),
      }
      addElement(newEl)
      toast({ title: `"${name}" adicionado`, description: `Asset ${uploadCategory} importado com sucesso.`, variant: "success" })
      setShowUploadModal(false)
      setUploadedFileName("")
    }
    fileInput.click()
  }

  return (
    <aside className="w-64 border-r border-border bg-card/30 flex flex-col shrink-0">
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar elementos..."
            className="pl-8 h-8 text-xs bg-muted/50 border-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full h-8 text-xs">
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload Asset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload de Asset</DialogTitle>
              <DialogDescription>
                Faça upload de modelos 3D, vídeos ou imagens para usar na cena.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Tipo de Arquivo</Label>
                <Select value={uploadCategory} onValueChange={(v: any) => setUploadCategory(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3d">Modelo 3D (.glb/.gltf)</SelectItem>
                    <SelectItem value="video">Vídeo (.mp4/.mov)</SelectItem>
                    <SelectItem value="image">Imagem (.png/.jpg)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div
                onClick={handleFakeUpload}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <FileUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Clique para selecionar arquivo</p>
                  <p className="text-xs text-muted-foreground/60">
                    {uploadCategory === "3d" ? "GLB, GLTF" : uploadCategory === "video" ? "MP4, MOV, WebM" : "PNG, JPG, JPEG"}
                    {" • Máx 50MB"}
                  </p>
                </div>
              </div>
              {uploadedFileName && (
                <p className="text-xs text-emerald-400">✓ {uploadedFileName} carregado</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadModal(false)}>Cancelar</Button>
              <Button variant="gradient" onClick={handleFakeUpload} disabled={!uploadedFileName}>
                Adicionar à Cena
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2 flex items-center gap-1">
              <Square className="h-3 w-3" />
              Botões Prontos
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {readyAssets.map((asset) => {
                const Icon = asset.icon
                return (
                  <button
                    key={asset.name}
                    onClick={() => handleAddReadyAsset(asset)}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${asset.color}20` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: asset.color }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors truncate w-full text-center">
                      {asset.name.replace("Botão ", "")}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
             Elementos de Mídia
            </p>
            <div className="space-y-1">
              {midia.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.type}
                    onClick={() => handleAddElement(item)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-accent/50 transition-colors text-left group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">Clique para adicionar</p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )
              })}
            </div>
          </div>

          {assets.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
                Meus Assets
              </p>
              <div className="space-y-1">
                {assets.map((asset) => {
                  const catLabel: Record<string, { color: string; icon: any }> = {
                    "3d": { color: "#7c3aed", icon: Box },
                    video: { color: "#3b82f6", icon: Video },
                    image: { color: "#f59e0b", icon: Image },
                  }
                  const info = catLabel[asset.category] || { color: "#666", icon: Box }
                  const Icon = info.icon
                  return (
                    <button
                      key={asset.id}
                      onClick={() => handleAddAsset(asset)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-accent/50 transition-colors text-left group"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${info.color}20` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: info.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{asset.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{asset.category}</p>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {botoes.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
                Outros Botões
              </p>
              <div className="space-y-1">
                {botoes.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.type}
                      onClick={() => handleAddElement(item)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-accent/50 transition-colors text-left group"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">Clique para adicionar</p>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {elements.length} elementos na cena
        </p>
      </div>
    </aside>
  )
}
