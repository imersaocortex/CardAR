"use client"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useStudioStore } from "@/store"
import { Smartphone, Camera, Share2, ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

export function StudioPreview() {
  const { isPreviewOpen, setPreviewOpen } = useStudioStore()

  return (
    <Dialog open={isPreviewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        <VisuallyHidden>
          <DialogTitle>Preview</DialogTitle>
        </VisuallyHidden>
        <div className="relative bg-black aspect-[9/16] flex items-center justify-center">
          <div className="text-center">
            <Smartphone className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-2">Preview AR</p>
            <p className="text-xs text-muted-foreground/60">Experiência rodando no dispositivo</p>

            <div className="flex items-center gap-4 mt-8 justify-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Share2 className="h-5 w-5 text-primary" />
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>

          {/* Mock camera overlay */}
          <div className="absolute inset-0 border-2 border-primary/30 rounded-2xl pointer-events-none" />
          <div className="absolute top-4 left-4 right-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">AR Business</span>
              <span className="text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">00:05</span>
            </div>
          </div>

          {/* Corner markers */}
          {["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
            <div
              key={pos}
              className={`absolute ${pos} w-6 h-6 border-primary/50`}
              style={{
                borderLeft: pos.includes("left") ? "2px solid" : "none",
                borderRight: pos.includes("right") ? "2px solid" : "none",
                borderTop: pos.includes("top") ? "2px solid" : "none",
                borderBottom: pos.includes("bottom") ? "2px solid" : "none",
              }}
            />
          ))}
        </div>

        <div className="p-4 flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Camera className="h-4 w-4 mr-1" />
            Foto
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Share2 className="h-4 w-4 mr-1" />
            Compartilhar
          </Button>
          <Button variant="gradient" size="sm" className="flex-1">
            <ExternalLink className="h-4 w-4 mr-1" />
            Abrir Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
