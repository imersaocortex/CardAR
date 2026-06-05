"use client"

import { useEffect, useCallback, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Save, Play, QrCode, Eye, ArrowLeft, Monitor, Smartphone, Download, X, FileImage, Upload, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { useStudioStore } from "@/store"
import { StudioViewport } from "@/components/studio/viewport"
import { StudioSidebar } from "@/components/studio/sidebar"
import { StudioProperties } from "@/components/studio/properties"
import { StudioTimeline } from "@/components/studio/timeline"
import { StudioLayers } from "@/components/studio/layers"
import { StudioPreview } from "@/components/studio/preview"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { projectTypeDimensions } from "@/store"
import { createClient } from "@/lib/supabase/client"
import { mapProjectType } from "@/lib/utils"
import Link from "next/link"

export default function StudioPage() {
  const params = useParams()
  const router = useRouter()
  const {
    isSaved, setSaved, isPlaying, setPlaying,
    isPreviewOpen, setPreviewOpen, selectedElementId,
    selectElement, projectType, setProjectType,
    loadScene, saveScene, setProjectId, elements, projectId,
  } = useStudioStore()

  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [projectSlug, setProjectSlug] = useState("")
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false)
  const [markerImageUrl, setMarkerImageUrl] = useState<string | null>(null)
  const [markerTargetUrl, setMarkerTargetUrl] = useState<string | null>(null)
  const [markerFile, setMarkerFile] = useState<File | null>(null)
  const [markerPreview, setMarkerPreview] = useState<string | null>(null)
  const [uploadingMarker, setUploadingMarker] = useState(false)

  useEffect(() => {
    const pid = params.id as string
    setProjectId(pid)

    async function init() {
      // Load project info
      const supabase = createClient()
      const { data: project } = await supabase
        .from("projects")
        .select("*")
        .eq("id", pid)
        .single()

      if (project) {
        setProjectType(mapProjectType(project.type) as any)
        setProjectSlug(project.slug)
      }

      // Load marker data
      const { data: marker } = await supabase
        .from("project_markers")
        .select("*")
        .eq("project_id", pid)
        .single()

      if (marker) {
        setMarkerImageUrl(marker.image_url)
        setMarkerTargetUrl(marker.target_url)
      }

      // Load scene
      await loadScene(pid)
    }

    init()
  }, [params.id, setProjectType, loadScene, setProjectId])

  const dims = projectTypeDimensions[projectType]

  const handleSave = useCallback(async () => {
    await saveScene()
    setSaved(true)
    toast({ title: "Projeto salvo", description: "Todas as alterações foram salvas.", variant: "success" })
  }, [saveScene, setSaved])

  const handlePublish = useCallback(async () => {
    const supabase = createClient()
    await supabase
      .from("projects")
      .update({ status: "published" })
      .eq("id", params.id)

    toast({ title: "Projeto publicado!", description: "Sua experiência AR está no ar.", variant: "success" })
  }, [params.id])

  const handlePreview = useCallback(() => {
    setPreviewOpen(true)
  }, [setPreviewOpen])

  const handleQrCode = useCallback(async () => {
    if (!projectSlug) return
    const url = `${window.location.origin}/experience/${projectSlug}`
    try {
      const QRCode = (await import("qrcode")).default
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      })
      setQrCodeUrl(dataUrl)
      setQrDialogOpen(true)
    } catch {
      toast({ title: "Erro ao gerar QR Code", variant: "destructive" })
    }
  }, [projectSlug])

  const handleMarkerUpload = useCallback(async () => {
    if (!markerFile || !projectId) return
    setUploadingMarker(true)
    try {
      const supabase = createClient()
      const ext = markerFile.name.endsWith(".png") ? "png" : "jpg"
      const fileName = `marker_${projectId}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("markers")
        .upload(fileName, markerFile, { upsert: true })

      if (uploadError) throw new Error(uploadError.message)

      const { data: urlData } = await supabase.storage
        .from("markers")
        .getPublicUrl(fileName)

      if (!urlData?.publicUrl) throw new Error("Erro ao obter URL")

      const { error: markerError } = await supabase
        .from("project_markers")
        .upsert({
          project_id: projectId,
          image_url: urlData.publicUrl,
          width: 0,
          height: 0,
        }, { onConflict: "project_id" })

      if (markerError) throw new Error(markerError.message)

      setMarkerImageUrl(urlData.publicUrl)
      setMarkerFile(null)
      setMarkerPreview(null)
      toast({ title: "Marcador salvo", variant: "success" })

      // Auto-compile marker for tracking
      setUploadingMarker(false)
      await handleCompileMarker(urlData.publicUrl)
    } catch (err: any) {
      toast({ title: "Erro ao enviar marcador", description: err.message, variant: "destructive" })
      setUploadingMarker(false)
    }
  }, [markerFile, projectId])

  const handleCompileMarker = useCallback(async (imageUrl?: string) => {
    const url = imageUrl || markerImageUrl
    if (!url || !projectId) return

    setUploadingMarker(true)
    try {
      // Download image via Supabase client (authenticated session)
      const supabase = createClient()

      // Extract filename from storage URL
      const imageFileName = url.split("/").pop() || ""
      if (!imageFileName) throw new Error("URL inválida")

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("markers")
        .download(imageFileName)

      if (downloadError || !fileData) throw new Error("Falha ao baixar imagem do marcador")

      const objectUrl = URL.createObjectURL(fileData)

      const { compileMarkerImage } = await import("@/lib/mindar/compile")
      const buffer = await compileMarkerImage(objectUrl)
      URL.revokeObjectURL(objectUrl)

      const mindBlob = new Blob([buffer as unknown as BlobPart], { type: "application/octet-stream" })
      const mindFile = `target_${projectId}_${Date.now()}.mind`

      const { error: uploadError } = await supabase.storage
        .from("public-previews")
        .upload(mindFile, mindBlob, { upsert: true, contentType: "application/octet-stream" })

      if (uploadError) throw new Error(uploadError.message)

      const { data: urlData } = await supabase.storage
        .from("public-previews")
        .getPublicUrl(mindFile)

      if (!urlData?.publicUrl) throw new Error("Erro ao obter URL")

      const { error: updateError } = await supabase
        .from("project_markers")
        .update({ target_url: urlData.publicUrl })
        .eq("project_id", projectId)

      if (updateError) throw new Error(updateError.message)

      setMarkerTargetUrl(urlData.publicUrl)
      toast({ title: "Marcador compilado", description: "Tracking AR pronto para uso.", variant: "success" })
    } catch (err: any) {
      toast({ title: "Erro ao compilar marcador", description: err.message, variant: "destructive" })
    }
    setUploadingMarker(false)
  }, [markerImageUrl, projectId])

  const handleMarkerRemove = useCallback(async () => {
    if (!projectId) return
    const supabase = createClient()

    const { data: existing } = await supabase
      .from("project_markers")
      .select("id, image_url, target_url")
      .eq("project_id", projectId)
      .single()

    if (existing?.image_url) {
      const imgUrl = new URL(existing.image_url)
      const imgFile = imgUrl.pathname.split("/").pop()
      if (imgFile) {
        await supabase.storage.from("markers").remove([imgFile])
      }

      if (existing.target_url) {
        const tgtUrl = new URL(existing.target_url)
        const tgtFile = tgtUrl.pathname.split("/").pop()
        if (tgtFile) {
          await supabase.storage.from("public-previews").remove([tgtFile])
        }
      }

      await supabase.from("project_markers").delete().eq("id", existing.id)
    }

    setMarkerImageUrl(null)
    setMarkerTargetUrl(null)
    toast({ title: "Marcador removido", variant: "success" })
  }, [projectId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedElementId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          useStudioStore.getState().removeElement(selectedElementId)
          selectElement(null)
        }
      }
      if (e.key === " ") {
        e.preventDefault()
        setPlaying(!isPlaying)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave, isPlaying, setPlaying, selectedElementId, selectElement])

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-sm font-medium">Projeto</h1>
            <p className="text-xs text-muted-foreground">
              {elements.length} elementos • {isSaved ? "Salvo" : "Não salvo"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1 mr-2 bg-muted rounded-lg p-1">
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setPlaying(!isPlaying)}>
            <Play className="h-4 w-4 mr-1" />
            {isPlaying ? "Pausar" : "Play"}
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            Salvar
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button variant="secondary" size="sm" onClick={handleQrCode}>
            <QrCode className="h-4 w-4 mr-1" />
            QR Code
          </Button>
          <Button variant="gradient" size="sm" onClick={handlePublish}>
            Publicar
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <span className="text-xs text-muted-foreground">
          Formato: <span className="text-foreground font-medium capitalize">
            {projectType === "cartao" ? "Cartão de Visita" : projectType === "panfleto" ? "Panfleto A4" : "Post 1×1"}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-xs text-muted-foreground">{dims.label}</span>
        <span className="text-xs text-muted-foreground">•</span>
        <button
          onClick={() => setMarkerDialogOpen(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileImage className="h-3.5 w-3.5" />
          {markerImageUrl ? "Alterar Marcador" : "Configurar Marcador"}
          {markerImageUrl && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <StudioSidebar />
        <div className="flex-1 relative">
          <StudioViewport />
        </div>
        <div className="w-72 border-l border-border bg-card/30 overflow-y-auto shrink-0 hidden md:block">
          <StudioProperties />
          <StudioLayers />
        </div>
      </div>

      <StudioTimeline />
      <StudioPreview />

      <Dialog open={markerDialogOpen} onOpenChange={setMarkerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Marcador de Imagem</DialogTitle>
            <DialogDescription>
              O marcador é a imagem que o aplicativo reconhecerá para ativar a realidade aumentada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {markerImageUrl && (
              <div className="space-y-2">
                <Label>Marcador atual</Label>
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={"/api/storage/download?url=" + encodeURIComponent(markerImageUrl)} alt="Marcador" className="w-full max-h-48 object-contain bg-muted" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{markerImageUrl ? "Substituir marcador" : "Selecionar imagem"}</Label>
              <div
                onClick={() => document.getElementById("marker-file-input")?.click()}
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
                id="marker-file-input"
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
            </div>

            {markerTargetUrl && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  ✓ Arquivo de tracking compilado pronto
                </p>
              </div>
            )}

            {markerImageUrl && !markerTargetUrl && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <p className="text-xs text-amber-600">
                  Marcador precisa ser compilado para funcionar no AR.
                </p>
              </div>
            )}

            {!markerImageUrl && !markerFile && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <p className="text-xs text-amber-600">
                  Nenhum marcador configurado. A experiência AR não funcionará sem uma imagem de marcador.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between">
            <div>
              {markerImageUrl && (
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={handleMarkerRemove}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remover
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {markerImageUrl && !markerTargetUrl && (
                <Button variant="secondary" size="sm" onClick={() => handleCompileMarker()} disabled={uploadingMarker}>
                  {uploadingMarker ? "Compilando..." : "Compilar Marcador"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setMarkerDialogOpen(false)}>
                Fechar
              </Button>
              {markerFile && (
                <Button variant="gradient" size="sm" onClick={handleMarkerUpload} disabled={uploadingMarker}>
                  {uploadingMarker ? "Enviando..." : "Salvar Marcador"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code do Projeto</DialogTitle>
            <DialogDescription>
              Escaneie com seu smartphone para visualizar a experiência AR.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrCodeUrl && (
              <>
                <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64 rounded-xl border border-border" />
                <p className="text-xs text-muted-foreground text-center break-all">
                  {window.location.origin}/experience/{projectSlug}
                </p>
                <a
                  href={qrCodeUrl}
                  download={`qrcode-${projectSlug}.png`}
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Download className="h-4 w-4" />
                  Baixar QR Code
                </a>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
