"use client"

import { useStudioStore } from "@/store"
import { Eye, EyeOff, Lock, Unlock, GripVertical, Box, Video, MessageCircle, Globe, Image, Phone, Mail, Camera, Cuboid } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useState } from "react"

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  "modelo-3d": Box,
  "modelo-3d-animado": Cuboid,
  "video-mp4": Video,
  "video-chromakey": Camera,
  "botao-whatsapp": MessageCircle,
  "botao-site": Globe,
  "botao-instagram": Image,
  "botao-ligar": Phone,
  "botao-email": Mail,
}

export function StudioLayers() {
  const { layers, selectedElementId, selectElement, toggleLayerVisibility, toggleLayerLock, reorderLayers } = useStudioStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const sortedLayers = [...layers].sort((a, b) => b.order - a.order)

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const newLayers = [...layers]
    const [moved] = newLayers.splice(dragIndex, 1)
    newLayers.splice(index, 0, moved)
    const reordered = newLayers.map((l, i) => ({ ...l, order: i }))
    reorderLayers(reordered)
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Camadas
      </p>
      <div className="space-y-1">
        {sortedLayers.map((layer, index) => {
          const Icon = typeIcons[layer.type] || Box
          const isSelected = layer.id === selectedElementId

          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => selectElement(layer.id)}
              className={cn(
                "flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors group",
                isSelected
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-accent/50 border border-transparent"
              )}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 text-xs truncate">{layer.name}</span>

              <button
                onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id) }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id) }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
