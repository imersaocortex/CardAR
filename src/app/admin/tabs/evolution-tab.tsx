"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  MessageSquare, Key, Globe, Save, CheckCircle2, XCircle, HelpCircle,
  Smartphone, ShieldAlert, Webhook,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"

interface EvolutionTabProps {
  settings: any
  onSaved: () => void
}

export function EvolutionTab({ settings, onSaved }: EvolutionTabProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle")
  const [enabled, setEnabled] = useState(false)
  const [form, setForm] = useState({
    server_url: "",
    api_key: "",
    instance_name: "",
  })

  useEffect(() => {
    if (settings?.evolution) {
      const evo = settings.evolution as Record<string, any>
      setEnabled(evo.enabled ?? false)
      setForm({
        server_url: evo.server_url || "",
        api_key: evo.api_key || "",
        instance_name: evo.instance_name || "",
      })
    }
  }, [settings])

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: any = {
        evolution: {
          enabled,
          server_url: form.server_url || undefined,
          api_key: form.api_key || undefined,
          instance_name: form.instance_name || undefined,
        },
      }

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao salvar")
      }

      toast({ title: "Configuração Evolution salva!" })
      onSaved()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult("idle")
    try {
      const res = await fetch(form.server_url.replace(/\/+$/, "") + "/instance/connectionState/" + form.instance_name, {
        method: "GET",
        headers: {
          "apikey": form.api_key,
        },
      })

      if (res.ok) {
        setTestResult("success")
        toast({ title: "Conexão com Evolution API estabelecida!" })
      } else {
        const errText = await res.text()
        setTestResult("error")
        toast({ title: "Falha na conexão", description: errText || "Erro desconhecido", variant: "destructive" })
      }
    } catch (err: any) {
      setTestResult("error")
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Evolution API — Notificações WhatsApp
            </CardTitle>
            <CardDescription>
              Configure a integração com a Evolution API para enviar notificações WhatsApp aos clientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/20 border border-border">
              <Switch
                id="evolution-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <Label htmlFor="evolution-enabled" className="font-medium">
                {enabled ? "Notificações WhatsApp ativadas" : "Notificações WhatsApp desativadas"}
              </Label>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                CONFIGURAÇÃO DA API
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="evo-server-url">URL do Servidor</Label>
                  <Input
                    id="evo-server-url"
                    value={form.server_url}
                    onChange={(e) => setForm((p) => ({ ...p, server_url: e.target.value }))}
                    placeholder="https://api.evolution.com"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL base da sua instância Evolution API
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evo-api-key">Chave da API</Label>
                  <Input
                    id="evo-api-key"
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm((p) => ({ ...p, api_key: e.target.value }))}
                    placeholder="Chave de API da Evolution"
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="evo-instance">Nome da Instância</Label>
                <Input
                  id="evo-instance"
                  value={form.instance_name}
                  onChange={(e) => setForm((p) => ({ ...p, instance_name: e.target.value }))}
                  placeholder="minha-instancia"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Nome da instância configurada na Evolution API
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                NOTIFICAÇÕES AUTOMÁTICAS
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mb-2" />
                  <h4 className="text-sm font-medium mb-1">Pagamento Confirmado</h4>
                  <p className="text-xs text-muted-foreground">
                    Notifica o cliente quando um pagamento é confirmado
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <XCircle className="h-5 w-5 text-amber-500 mb-2" />
                  <h4 className="text-sm font-medium mb-1">Fatura Vencida</h4>
                  <p className="text-xs text-muted-foreground">
                    Avisa o cliente sobre faturas vencidas e suspensão de projetos
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <ShieldAlert className="h-5 w-5 text-blue-500 mb-2" />
                  <h4 className="text-sm font-medium mb-1">Avisos do Sistema</h4>
                  <p className="text-xs text-muted-foreground">
                    Envia avisos importantes sobre manutenção e atualizações
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button onClick={testConnection} disabled={testing || !form.server_url || !form.api_key} variant="outline" className="gap-2">
                  {testing ? (
                    <>Testando...</>
                  ) : (
                    <>
                      <HelpCircle className="h-4 w-4" />
                      Testar Conexão
                    </>
                  )}
                </Button>
                {testResult === "success" && (
                  <span className="flex items-center gap-1 text-sm text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" /> Conectado
                  </span>
                )}
                {testResult === "error" && (
                  <span className="flex items-center gap-1 text-sm text-destructive">
                    <XCircle className="h-4 w-4" /> Falha
                  </span>
                )}
              </div>

              <Button onClick={handleSave} disabled={saving} variant="gradient" className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
              <Smartphone className="h-4 w-4 shrink-0" />
              <span>
                As notificações serão enviadas para o WhatsApp do proprietário da organização,
                utilizando o número cadastrado no perfil do cliente.
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
