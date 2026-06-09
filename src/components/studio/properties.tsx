"use client"

import { useState, useEffect } from "react"
import { useStudioStore } from "@/store"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Trash2, Upload, Box, Video, Image, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AnimationType } from "@/types"
import { toast } from "@/hooks/use-toast"

interface AssetItem {
  id: string
  name: string
  category: "3d" | "video" | "image"
  public_url: string
  mime_type: string
}

const assetTypeIcon: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  "3d": Box,
  video: Video,
  image: Image,
}

const assetTypeColor: Record<string, string> = {
  "3d": "#7c3aed",
  video: "#3b82f6",
  image: "#f59e0b",
}

const elementToAssetCategory: Record<string, string> = {
  "modelo-3d": "3d",
  "modelo-3d-animado": "3d",
  "video-mp4": "video",
  "video-chromakey": "video",
  "imagem": "image",
}

export function StudioProperties() {
  const { selectedElementId, elements, updateElement, removeElement, selectElement } = useStudioStore()
  const selectedElement = elements.find((el) => el.id === selectedElementId)
  const [showAssetDialog, setShowAssetDialog] = useState(false)
  const [assetSearch, setAssetSearch] = useState("")
  const [assets, setAssets] = useState<AssetItem[]>([])

  useEffect(() => {
    if (showAssetDialog && assets.length === 0) {
      fetch("/api/assets")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setAssets(data) })
        .catch(() => {})
    }
  }, [showAssetDialog, assets.length])

  if (!selectedElement) {
    return (
      <div className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Propriedades
        </p>
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Selecione um elemento</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Clique em um objeto na cena</p>
        </div>
      </div>
    )
  }

  const handleChange = (field: string, value: any) => {
    if (field.startsWith("position.")) {
      const idx = parseInt(field.split(".")[1])
      const newPos: [number, number, number] = [...selectedElement.position]
      newPos[idx] = parseFloat(value) || 0
      updateElement(selectedElement.id, { position: newPos })
    } else if (field.startsWith("rotation.")) {
      const idx = parseInt(field.split(".")[1])
      const newRot: [number, number, number] = [...selectedElement.rotation]
      newRot[idx] = parseFloat(value) || 0
      updateElement(selectedElement.id, { rotation: newRot })
    } else if (field.startsWith("scale.")) {
      const idx = parseInt(field.split(".")[1])
      const newScale: [number, number, number] = [...selectedElement.scale]
      newScale[idx] = parseFloat(value) || 0
      updateElement(selectedElement.id, { scale: newScale })
    } else if (field === "opacity") {
      updateElement(selectedElement.id, { opacity: parseFloat(value) || 0 })
    } else if (field === "duration") {
      updateElement(selectedElement.id, { duration: parseFloat(value) || 0 })
    } else if (field === "action") {
      updateElement(selectedElement.id, { action: value })
    } else if (field === "animationType") {
      updateElement(selectedElement.id, { animationType: value as AnimationType })
    } else if (field === "showCaption") {
      updateElement(selectedElement.id, { showCaption: value as boolean })
    } else if (field === "chromaKeyColor") {
      updateElement(selectedElement.id, { chromaKeyColor: value as string })
    } else if (field === "chromaKeyTolerance") {
      updateElement(selectedElement.id, { chromaKeyTolerance: parseFloat(value) || 0 })
    } else if (field === "chromaKeySmoothness") {
      updateElement(selectedElement.id, { chromaKeySmoothness: parseFloat(value) || 0 })
    }
  }

  const is3D = selectedElement.type === "modelo-3d" || selectedElement.type === "modelo-3d-animado"
  const isButton = selectedElement.type.startsWith("botao-")
  const isChromaKey = selectedElement.type === "video-chromakey"
  const isMedia = is3D || selectedElement.type === "video-mp4" || isChromaKey || selectedElement.type === "imagem" || selectedElement.type === "audio"

  const assetCategory = elementToAssetCategory[selectedElement.type]
  const filteredAssets = assets.filter((a) => {
    if (assetCategory && a.category !== assetCategory) return false
    if (assetSearch && !a.name.toLowerCase().includes(assetSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Propriedades
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive"
          onClick={() => {
            removeElement(selectedElement.id)
            selectElement(null)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium mb-1">{selectedElement.name}</p>
          <p className="text-xs text-muted-foreground mb-3 capitalize">{selectedElement.type.replace(/-/g, " ")}</p>
        </div>

        <Separator />

        {isMedia && (
          <div>
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setShowAssetDialog(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {selectedElement.assetUrl ? "Substituir Objeto" : "Selecionar Objeto"}
            </Button>
          </div>
        )}

        <Dialog open={showAssetDialog} onOpenChange={setShowAssetDialog}>
          <DialogContent className="max-w-lg max-h-[70vh]">
            <DialogHeader>
              <DialogTitle>Substituir Objeto</DialogTitle>
              <DialogDescription>
                Selecione um {assetCategory === "3d" ? "modelo 3D" : assetCategory === "video" ? "vídeo" : assetCategory === "image" ? "imagem" : "asset"} da biblioteca.
              </DialogDescription>
            </DialogHeader>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-10 h-8 text-xs bg-muted/50 border-0"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="flex-1 max-h-80">
              {filteredAssets.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Nenhum asset encontrado</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Faça upload na página de Assets</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredAssets.map((asset) => {
                    const Icon = assetTypeIcon[asset.category] || Box
                    const color = assetTypeColor[asset.category] || "#666"
                    return (
                      <button
                        key={asset.id}
                        onClick={() => {
                          updateElement(selectedElement.id, { assetUrl: asset.public_url, name: asset.name })
                          setShowAssetDialog(false)
                          setAssetSearch("")
                          toast({ title: "Objeto substituído", description: `"${asset.name}" foi vinculado.`, variant: "success" })
                        }}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left group border border-border/50 hover:border-primary/20"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                          <Icon className="h-4 w-4" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{asset.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{asset.category}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Posição</p>
          <div className="grid grid-cols-3 gap-2">
            {["X", "Y", "Z"].map((axis, i) => (
              <div key={axis}>
                <Label className="text-xs text-muted-foreground">{axis}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={Number(selectedElement.position[i].toFixed(2))}
                  onChange={(e) => handleChange(`position.${i}`, e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Rotação</p>
          <div className="grid grid-cols-3 gap-2">
            {["X", "Y", "Z"].map((axis, i) => (
              <div key={axis}>
                <Label className="text-xs text-muted-foreground">{axis}</Label>
                <Input
                  type="number"
                  step="5"
                  value={Number(selectedElement.rotation[i].toFixed(1))}
                  onChange={(e) => handleChange(`rotation.${i}`, e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Escala</p>
          <div className="grid grid-cols-3 gap-2">
            {["X", "Y", "Z"].map((axis, i) => (
              <div key={axis}>
                <Label className="text-xs text-muted-foreground">{axis}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={Number(selectedElement.scale[i].toFixed(2))}
                  onChange={(e) => handleChange(`scale.${i}`, e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Opacidade</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={selectedElement.opacity}
              onChange={(e) => handleChange("opacity", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Duração (s)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={selectedElement.duration}
              onChange={(e) => handleChange("duration", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        {isChromaKey && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Chromakey</p>
            <div>
              <Label className="text-xs text-muted-foreground">Cor do fundo</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={selectedElement.chromaKeyColor || "#00ff00"}
                  onChange={(e) => handleChange("chromaKeyColor", e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                />
                <Input
                  type="text"
                  value={selectedElement.chromaKeyColor || "#00ff00"}
                  onChange={(e) => handleChange("chromaKeyColor", e.target.value)}
                  className="h-7 text-xs font-mono flex-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Tolerância</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={selectedElement.chromaKeyTolerance ?? 0.1}
                  onChange={(e) => handleChange("chromaKeyTolerance", e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Suavidade</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={selectedElement.chromaKeySmoothness ?? 0.1}
                  onChange={(e) => handleChange("chromaKeySmoothness", e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <Separator />
          </div>
        )}

        {is3D && (
          <div>
            <Label className="text-xs text-muted-foreground">Animação</Label>
            <Select
              value={selectedElement.animationType || "none"}
              onValueChange={(v) => handleChange("animationType", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {selectedElement.hasEmbeddedAnimations && (
                  <SelectItem value="embedded">Animação Incorporada</SelectItem>
                )}
                <SelectItem value="float">Flutuar</SelectItem>
                <SelectItem value="rotate">Rotacionar</SelectItem>
                <SelectItem value="pulse">Pulsar</SelectItem>
              </SelectContent>
            </Select>
            {selectedElement.hasEmbeddedAnimations && selectedElement.animationType !== "embedded" && (
              <p className="text-[10px] text-cyan-400 mt-1">Este modelo possui animações incorporadas. Selecione "Animação Incorporada" para reproduzi-las.</p>
            )}
          </div>
        )}

        {isButton && (
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground cursor-pointer">Mostrar legenda</Label>
            <Switch
              checked={selectedElement.showCaption !== false}
              onCheckedChange={(v) => handleChange("showCaption", v)}
            />
          </div>
        )}

        {(selectedElement.action !== undefined || isButton) && (
          <div>
            <Label className="text-xs text-muted-foreground">Ação (URL)</Label>
            <Input
              type="text"
              value={selectedElement.action || ""}
              onChange={(e) => handleChange("action", e.target.value)}
              className="h-7 text-xs"
              placeholder="https://..."
            />
          </div>
        )}
      </div>
    </div>
  )
}
