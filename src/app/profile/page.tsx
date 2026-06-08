"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { User, Save, Upload, Loader2, Phone, FileText, MapPin, Home } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AppShell } from "@/components/layout/app-shell"
import { createClient } from "@/lib/supabase/client"
import { useAuthStore } from "@/store/auth-store"
import { toast } from "@/hooks/use-toast"

export default function ProfilePage() {
  const { profile, organization } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: "",
    phone: "",
    cpf_cnpj: "",
    address: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
    address_zipcode: "",
  })

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || "",
        phone: (profile as any).phone || "",
        cpf_cnpj: (profile as any).cpf_cnpj || "",
        address: (profile as any).address || "",
        address_number: (profile as any).address_number || "",
        address_complement: (profile as any).address_complement || "",
        address_neighborhood: (profile as any).address_neighborhood || "",
        address_city: (profile as any).address_city || "",
        address_state: (profile as any).address_state || "",
        address_zipcode: (profile as any).address_zipcode || "",
      })
    }
  }, [profile])

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const ext = file.name.split(".").pop() || "png"
      const fileName = `avatar_${user.id}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = await supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      if (urlData?.publicUrl) {
        await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id)
        toast({ title: "Foto atualizada!" })
        window.location.reload()
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from("profiles")
        .update({
          name: form.name,
          phone: form.phone || null,
          cpf_cnpj: form.cpf_cnpj || null,
          address: form.address || null,
          address_number: form.address_number || null,
          address_complement: form.address_complement || null,
          address_neighborhood: form.address_neighborhood || null,
          address_city: form.address_city || null,
          address_state: form.address_state || null,
          address_zipcode: form.address_zipcode || null,
        })
        .eq("id", user.id)

      if (error) throw error

      toast({ title: "Perfil atualizado com sucesso!" })
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const initials = profile?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie suas informações pessoais e de faturamento</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="glass border-border/50">
              <CardContent className="flex flex-col items-center py-8">
                <div className="relative mb-4">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">{initials}</AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-white hover:bg-primary/80 transition-colors"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAvatarUpload(file)
                  }}
                />
                <h3 className="font-semibold text-lg">{profile?.name}</h3>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">{organization?.name}</p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="glass border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-primary" />
                  Informações Pessoais
                </CardTitle>
                <CardDescription>Nome, telefone e documentos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="phone" className="pl-10" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf_cnpj">CPF / CNPJ</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="cpf_cnpj" className="pl-10" value={form.cpf_cnpj} onChange={(e) => setForm((p) => ({ ...p, cpf_cnpj: e.target.value }))} placeholder="000.000.000-00" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" />
                  Endereço
                </CardTitle>
                <CardDescription>Utilizado para cobrança e notas fiscais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Logradouro</Label>
                    <Input id="address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Rua, Avenida..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address_number">Número</Label>
                    <Input id="address_number" value={form.address_number} onChange={(e) => setForm((p) => ({ ...p, address_number: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address_complement">Complemento</Label>
                    <Input id="address_complement" value={form.address_complement} onChange={(e) => setForm((p) => ({ ...p, address_complement: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input id="neighborhood" value={form.address_neighborhood} onChange={(e) => setForm((p) => ({ ...p, address_neighborhood: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" value={form.address_city} onChange={(e) => setForm((p) => ({ ...p, address_city: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado</Label>
                    <Input id="state" maxLength={2} value={form.address_state} onChange={(e) => setForm((p) => ({ ...p, address_state: e.target.value }))} placeholder="SP" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipcode">CEP</Label>
                  <Input id="zipcode" value={form.address_zipcode} onChange={(e) => setForm((p) => ({ ...p, address_zipcode: e.target.value }))} placeholder="00000-000" />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} variant="gradient">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "Salvar Perfil"}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AppShell>
  )
}
