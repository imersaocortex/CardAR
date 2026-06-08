"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, Pencil, Trash2, Check, X, Tag, Package } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface Plan {
  id: string
  name: string
  slug: string
  price: number
  projects_limit: number
  assets_limit_bytes: number
  assets_limit_label: string
  features: string[]
  active: boolean
  created_at: string
  subscriptions?: { count: number }[]
}

const defaultFeatures = [
  "Projetos AR",
  "Modelos 3D",
  "Vídeos MP4",
  "QR Code",
]

export function PlansTab() {
  const { toast } = useToast()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    slug: "",
    price: 0,
    projects_limit: 0,
    assets_limit_bytes: 500 * 1024 * 1024,
    assets_limit_label: "500 MB",
    features: [...defaultFeatures],
    active: true,
    billing_cycle: "monthly",
    trial_days: 0,
    has_watermark: true,
    allowed_media_types: "image/png,image/jpeg,model/gltf-binary",
  })

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/admin/plans")
      const data = await res.json()
      setPlans(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlans()
  }, [])

  const openCreate = () => {
    setEditingPlan(null)
    setForm({
      name: "",
      slug: "",
      price: 0,
      projects_limit: 3,
      assets_limit_bytes: 500 * 1024 * 1024,
      assets_limit_label: "500 MB",
      features: [...defaultFeatures],
      active: true,
      billing_cycle: "monthly",
      trial_days: 0,
      has_watermark: true,
      allowed_media_types: "image/png,image/jpeg,model/gltf-binary",
    })
    setDialogOpen(true)
  }

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan)
    setForm({
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      projects_limit: plan.projects_limit,
      assets_limit_bytes: plan.assets_limit_bytes,
      assets_limit_label: plan.assets_limit_label,
      features: [...plan.features],
      active: plan.active,
      billing_cycle: (plan as any).billing_cycle || "monthly",
      trial_days: (plan as any).trial_days || 0,
      has_watermark: (plan as any).has_watermark !== false,
      allowed_media_types: Array.isArray((plan as any).allowed_media_types)
        ? (plan as any).allowed_media_types.join(", ")
        : "image/png,image/jpeg,model/gltf-binary",
    })
    setDialogOpen(true)
  }

  const addFeature = () => {
    setForm((p) => ({ ...p, features: [...p.features, ""] }))
  }

  const updateFeature = (i: number, value: string) => {
    setForm((p) => {
      const f = [...p.features]
      f[i] = value
      return { ...p, features: f }
    })
  }

  const removeFeature = (i: number) => {
    setForm((p) => ({
      ...p,
      features: p.features.filter((_, idx) => idx !== i),
    }))
  }

  const handleSave = async () => {
    if (!form.name || !form.slug) {
      toast({ title: "Preencha nome e slug", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const method = editingPlan ? "PUT" : "POST"
      const url = editingPlan ? `/api/admin/plans/${editingPlan.id}` : "/api/admin/plans"

      const body: any = {
        name: form.name,
        slug: form.slug,
        price: form.price,
        projects_limit: form.projects_limit,
        assets_limit_bytes: form.assets_limit_bytes,
        assets_limit_label: form.assets_limit_label,
        features: form.features.filter((f) => f.trim()),
        active: form.active,
        billing_cycle: form.billing_cycle,
        trial_days: form.trial_days,
        has_watermark: form.has_watermark,
        allowed_media_types: form.allowed_media_types.split(",").map((t) => t.trim()).filter(Boolean),
      }

      if (editingPlan) {
        const clean: Record<string, any> = {}
        for (const [k, v] of Object.entries(body)) {
          if (v !== undefined) clean[k] = v
        }
        body.changed = true
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(typeof err.error === "string" ? err.error : "Erro ao salvar")
      }

      toast({ title: editingPlan ? "Plano atualizado!" : "Plano criado!" })
      setDialogOpen(false)
      loadPlans()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/plans/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir")
      }
      toast({ title: "Plano excluído!" })
      loadPlans()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
    return `${bytes} B`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Gerenciamento de Planos
              </CardTitle>
              <Button onClick={openCreate} variant="gradient" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Plano
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Plano</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Preço</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Projetos</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Assets</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Assinaturas</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum plano encontrado
                      </td>
                    </tr>
                  )}
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-medium">{plan.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">({plan.slug})</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {plan.price === 0 ? "Gratuito" : `R$ ${plan.price.toFixed(2).replace('.', ',')}/mês`}
                      </td>
                      <td className="py-3 px-4">
                        {plan.projects_limit === 0 ? "Ilimitado" : plan.projects_limit}
                      </td>
                      <td className="py-3 px-4">{plan.assets_limit_label}</td>
                      <td className="py-3 px-4">
                        {plan.subscriptions?.[0]?.count || 0}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={plan.active ? "success" : "secondary"}>
                          {plan.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(plan)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(plan.id)}
                            disabled={deletingId === plan.id}
                            title="Excluir"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
            <DialogDescription>
              {editingPlan ? "Altere os dados do plano abaixo." : "Preencha os dados do novo plano de assinatura."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Nome *</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-slug">Slug *</Label>
                <Input
                  id="plan-slug"
                  value={form.slug}
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="pro"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-price">Preço (centavos)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    id="plan-price"
                    type="number"
                    className="pl-8"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-projects">Limite de Projetos</Label>
                <Input
                  id="plan-projects"
                  type="number"
                  value={form.projects_limit}
                  onChange={(e) => setForm((p) => ({ ...p, projects_limit: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-assets-bytes">Limite de Assets (bytes)</Label>
                <Input
                  id="plan-assets-bytes"
                  type="number"
                  value={form.assets_limit_bytes}
                  onChange={(e) => setForm((p) => ({ ...p, assets_limit_bytes: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">{formatBytes(form.assets_limit_bytes)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-assets-label">Label do Limite</Label>
                <Input
                  id="plan-assets-label"
                  value={form.assets_limit_label}
                  onChange={(e) => setForm((p) => ({ ...p, assets_limit_label: e.target.value }))}
                  placeholder="500 MB"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Funcionalidades</Label>
              {form.features.map((f, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={f}
                    onChange={(e) => updateFeature(i, e.target.value)}
                    placeholder="Ex: Suporte prioritário"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeFeature(i)} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addFeature} className="mt-1">
                <Plus className="h-3 w-3 mr-1" />
                Adicionar
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-billing">Ciclo de Cobrança</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(v) => setForm((p) => ({ ...p, billing_cycle: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-trial">Dias de Trial</Label>
                <Input
                  id="plan-trial"
                  type="number"
                  min="0"
                  value={form.trial_days}
                  onChange={(e) => setForm((p) => ({ ...p, trial_days: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="plan-watermark"
                checked={!form.has_watermark}
                onCheckedChange={(v) => setForm((p) => ({ ...p, has_watermark: !v }))}
              />
              <Label htmlFor="plan-watermark">Remover marca d'água</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-media-types">Tipos de Mídia Permitidos</Label>
              <Input
                id="plan-media-types"
                value={form.allowed_media_types}
                onChange={(e) => setForm((p) => ({ ...p, allowed_media_types: e.target.value }))}
                placeholder="image/png,image/jpeg,model/gltf-binary"
              />
              <p className="text-xs text-muted-foreground">Separe os tipos MIME por vírgula</p>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="plan-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))}
              />
              <Label htmlFor="plan-active">Plano ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} variant="gradient">
              {saving ? "Salvando..." : editingPlan ? "Atualizar" : "Criar Plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
