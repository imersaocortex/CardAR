"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Palette, Save, Image, Globe, Upload, Trash2, Loader2, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface BrandingTabProps {
  settings: any
  onSaved: () => void
}

type ImageField = "logo_url" | "favicon_url" | "og_image_url"

const IMAGE_FIELDS: { key: ImageField; label: string; description: string }[] = [
  { key: "logo_url", label: "Logotipo", description: "PNG, SVG ou WebP. Recomendado: 200x200px" },
  { key: "favicon_url", label: "Favicon", description: "ICO ou PNG. Recomendado: 32x32px" },
  { key: "og_image_url", label: "OG Image", description: "Imagem para compartilhamento. Recomendado: 1200x630px" },
]

export function BrandingTab({ settings, onSaved }: BrandingTabProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<ImageField | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<ImageField | null>(null)

  const [branding, setBranding] = useState({
    site_name: "",
    logo_url: "",
    favicon_url: "",
    primary_color: "#6366f1",
    secondary_color: "#8b5cf6",
    accent_color: "#06b6d4",
    og_image_url: "",
    footer_text: "",
    meta_title: "",
    meta_description: "",
  })

  useEffect(() => {
    if (settings?.branding) {
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(settings.branding as Record<string, unknown>)) {
        clean[k] = typeof v === "string" ? v : ""
      }
      setBranding((prev) => ({ ...prev, ...clean }))
    }
  }, [settings])

  const handleUpload = async (field: ImageField, file: File) => {
    setUploading(field)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("field", field)

      const res = await fetch("/api/admin/branding/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao fazer upload")
      }

      const { url } = await res.json()
      setBranding((prev) => ({ ...prev, [field]: url }))
      toast({ title: `${IMAGE_FIELDS.find((f) => f.key === field)?.label} atualizado!` })
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setUploading(null)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && uploadTarget) {
      handleUpload(uploadTarget, file)
    }
    e.target.value = ""
  }

  const triggerUpload = (field: ImageField) => {
    setUploadTarget(field)
    fileInputRef.current?.click()
  }

  const removeImage = (field: ImageField) => {
    setBranding((prev) => ({ ...prev, [field]: "" }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branding: {
            site_name: branding.site_name,
            logo_url: branding.logo_url || null,
            favicon_url: branding.favicon_url || null,
            primary_color: branding.primary_color,
            secondary_color: branding.secondary_color,
            accent_color: branding.accent_color,
            og_image_url: branding.og_image_url || null,
            footer_text: branding.footer_text || null,
            meta_title: branding.meta_title || null,
            meta_description: branding.meta_description || null,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao salvar")
      }

      toast({ title: "Identidade visual salva com sucesso!" })
      onSaved()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
        className="hidden"
        onChange={handleFileSelect}
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Identidade Visual
            </CardTitle>
            <CardDescription>
              Personalize a aparência do sistema — logotipo, cores e informações da marca
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                INFORMAÇÕES DA MARCA
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="site_name">Nome do Sistema</Label>
                  <Input
                    id="site_name"
                    value={branding.site_name}
                    onChange={(e) => setBranding((p) => ({ ...p, site_name: e.target.value }))}
                    placeholder="CortexAR"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="footer_text">Texto do Rodapé</Label>
                  <Input
                    id="footer_text"
                    value={branding.footer_text}
                    onChange={(e) => setBranding((p) => ({ ...p, footer_text: e.target.value }))}
                    placeholder="© 2026 CortexAR"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Search className="h-4 w-4" />
                SEO / COMPARTILHAMENTO
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="meta_title">Meta Título</Label>
                  <Input
                    id="meta_title"
                    value={branding.meta_title}
                    onChange={(e) => setBranding((p) => ({ ...p, meta_title: e.target.value }))}
                    placeholder="CortexAR - Realidade Aumentada para Negócios"
                  />
                  <p className="text-xs text-muted-foreground">Usado como título em compartilhamentos (WhatsApp, redes sociais)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta_description">Meta Descrição</Label>
                  <Input
                    id="meta_description"
                    value={branding.meta_description}
                    onChange={(e) => setBranding((p) => ({ ...p, meta_description: e.target.value }))}
                    placeholder="Crie experiências de realidade aumentada para cartões de visita, panfletos e materiais impressos."
                  />
                  <p className="text-xs text-muted-foreground">Usado como descrição em compartilhamentos (WhatsApp, redes sociais)</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Image className="h-4 w-4" />
                IMAGENS
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {IMAGE_FIELDS.map(({ key, label, description }) => {
                  const hasImage = !!branding[key]
                  const isUploading = uploading === key

                  return (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <div
                        className={cn(
                          "relative rounded-xl border-2 border-dashed border-border p-4 transition-all",
                          "hover:border-primary/50 hover:bg-muted/10 cursor-pointer",
                          hasImage && "border-solid border-primary/30",
                        )}
                        onClick={() => !isUploading && triggerUpload(key)}
                      >
                        {isUploading ? (
                          <div className="flex flex-col items-center justify-center py-6 gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Enviando...</span>
                          </div>
                        ) : hasImage ? (
                          <div className="relative group">
                            <div className="w-full h-28 rounded-lg overflow-hidden bg-muted/20 flex items-center justify-center">
                              <img
                                src={branding[key]}
                                alt={label}
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'><path d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/></svg>"
                                }}
                              />
                            </div>
                            <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-white hover:text-white hover:bg-white/20"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  triggerUpload(key)
                                }}
                              >
                                <Upload className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-white hover:text-white hover:bg-red-500/30"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeImage(key)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 gap-2">
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground text-center">
                              Clique para fazer upload
                            </span>
                            <span className="text-[10px] text-muted-foreground text-center">
                              {description}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Palette className="h-4 w-4" />
                CORES
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { key: "primary_color", label: "Cor Primária", default: "#6366f1" },
                  { key: "secondary_color", label: "Cor Secundária", default: "#8b5cf6" },
                  { key: "accent_color", label: "Cor de Destaque", default: "#06b6d4" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <div className="flex gap-2 items-center">
                      <div
                        className="w-10 h-10 rounded-lg border border-border shrink-0"
                        style={{ backgroundColor: (branding as any)[key] }}
                      />
                      <Input
                        value={(branding as any)[key]}
                        onChange={(e) => setBranding((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={key}
                        className="font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                {[
                  { label: "Preview Card", color: branding.primary_color },
                  { label: "Preview Botão", color: branding.secondary_color },
                  { label: "Preview Destaque", color: branding.accent_color },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div
                      className="px-4 py-2 rounded-lg text-white text-xs font-medium"
                      style={{ backgroundColor: color }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving} variant="gradient">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "Salvar Identidade Visual"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
