"use client"

import { useStudioStore } from "@/store"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Trash2, Upload, FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnimationType } from "@/types"
import { toast } from "@/hooks/use-toast"

export function StudioProperties() {
  const { selectedElementId, elements, updateElement, removeElement, selectElement } = useStudioStore()
  const selectedElement = elements.find((el) => el.id === selectedElementId)

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

  const handleFakeUpload = () => {
    const fileInput = document.createElement("input")
    fileInput.type = "file"
    const extMap: Record<string, string> = {
      "modelo-3d": ".glb,.gltf",
      "modelo-3d-animado": ".glb,.gltf",
      "video-mp4": ".mp4,.mov,.webm",
      "video-chromakey": ".mp4,.mov,.webm",
      "imagem": ".png,.jpg,.jpeg,.webp",
      "audio": ".mp3,.wav,.ogg,.m4a",
    }
    fileInput.accept = extMap[selectedElement.type] || "*"
    fileInput.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const url = URL.createObjectURL(file)
      updateElement(selectedElement.id, { assetUrl: url, name: file.name.replace(/\.[^/.]+$/, "") })
      toast({ title: "Asset atualizado", description: `"${file.name}" foi vinculado ao elemento.`, variant: "success" })
    }
    fileInput.click()
  }

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
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={handleFakeUpload}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {selectedElement.assetUrl ? "Substituir Asset" : "Upload Asset"}
            </Button>
          </div>
        )}

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
                <SelectItem value="float">Flutuar</SelectItem>
                <SelectItem value="rotate">Rotacionar</SelectItem>
                <SelectItem value="pulse">Pulsar</SelectItem>
              </SelectContent>
            </Select>
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
