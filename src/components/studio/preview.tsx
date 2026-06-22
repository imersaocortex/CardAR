"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useStudioStore } from "@/store"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { ArPlayer } from "@/components/ar/ar-player"
import { Smartphone, Loader2 } from "lucide-react"
import type { ArExperienceData, ArState } from "@/lib/mindar"

interface StudioPreviewProps {
  markerImageUrl: string | null
  markerTargetUrl: string | null
}

export function StudioPreview({ markerImageUrl, markerTargetUrl }: StudioPreviewProps) {
  const { isPreviewOpen, setPreviewOpen, elements, projectType, projectId, sceneId } = useStudioStore()
  const [arState, setArState] = useState<ArState>("loading")

  const experience = useMemo((): ArExperienceData | null => {
    if (!projectId || !sceneId) return null

    return {
      id: projectId,
      name: "Preview",
      type: projectType,
      thumbnailUrl: null,
      marker: markerImageUrl
        ? { imageUrl: markerImageUrl, targetUrl: markerTargetUrl }
        : null,
      scene: {
        id: sceneId,
        name: "Preview Scene",
        backgroundColor: "#000000",
        objects: elements
          .filter((el) => el.visible)
          .map((el) => ({
            id: el.id,
            type: el.type,
            name: el.name,
            position: el.position,
            rotation: el.rotation,
            scale: el.scale,
            opacity: el.opacity,
            visible: el.visible,
            animationType: el.animationType || null,
            action: el.action || null,
            assetUrl: el.assetUrl || null,
            assetThumbnail: el.assetThumbnail || null,
            showCaption: el.showCaption ?? null,
            chromaKeyColor: el.chromaKeyColor || null,
            chromaKeyTolerance: el.chromaKeyTolerance ?? null,
            chromaKeySmoothness: el.chromaKeySmoothness ?? null,
            duration: el.duration || null,
          })),
      },
    }
  }, [projectId, sceneId, elements, projectType, markerImageUrl, markerTargetUrl])

  return (
    <Dialog open={isPreviewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        <VisuallyHidden>
          <DialogTitle>Preview AR</DialogTitle>
        </VisuallyHidden>

        <div className="relative bg-black aspect-[9/16] overflow-hidden">
          {experience ? (
            <>
              <ArPlayer
                experience={experience}
                hasWatermark={false}
                onStateChange={setArState}
              />
              {arState === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Iniciando câmera...</p>
                  </div>
                </div>
              )}
              {arState === "scanning" && !markerImageUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                  <div className="text-center px-6">
                    <Smartphone className="h-10 w-10 text-primary/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum marcador configurado</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Configure um marcador para testar o preview AR</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Smartphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Carregando preview...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
