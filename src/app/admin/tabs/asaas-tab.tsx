"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Settings, Key, Globe, Save, CheckCircle2, XCircle, HelpCircle,
  Bug, Rocket, ShieldAlert, ExternalLink,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface AsaasTabProps {
  settings: any
  onSaved: () => void
}

type Environment = "debug" | "production"

const ENVIRONMENTS: { id: Environment; label: string; description: string; icon: typeof Bug; color: string; bg: string; border: string; url: string }[] = [
  {
    id: "debug",
    label: "Debug",
    description: "Ambiente de desenvolvimento e testes. Use para depurar integrações sem cobranças reais.",
    icon: Bug,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    url: "https://api-sandbox.asaas.com/v3",
  },
  {
    id: "production",
    label: "Produção",
    description: "Ambiente de produção com cobranças reais. Dados reais de clientes e pagamentos.",
    icon: Rocket,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    url: "https://api.asaas.com/v3",
  },
]

export function AsaasTab({ settings, onSaved }: AsaasTabProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle")
  const [environment, setEnvironment] = useState<Environment>("debug")
  const [keys, setKeys] = useState({
    debug: { api_key: "", webhook_secret: "", configured: false },
    production: { api_key: "", webhook_secret: "", configured: false },
  })

  const normalizeEnv = (env: string): Environment => {
    if (env === "production") return "production"
    return "debug"
  }

  useEffect(() => {
    if (settings?.asaas) {
      const asaas = settings.asaas as Record<string, any>

      setEnvironment(normalizeEnv(asaas.environment))

      setKeys({
        debug: {
          api_key: asaas.debug_api_key || asaas.api_key || "",
          webhook_secret: asaas.debug_webhook_secret || asaas.webhook_secret || "",
          configured: asaas.debug_api_key_configured ?? asaas.api_key_configured ?? false,
        },
        production: {
          api_key: asaas.production_api_key || "",
          webhook_secret: asaas.production_webhook_secret || "",
          configured: asaas.production_api_key_configured ?? false,
        },
      })
    }
  }, [settings])

  const currentKey = keys[environment]

  const maskKey = (key: string) => {
    if (!key || key.length < 8) return key
    return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: any = {
        asaas: {
          environment,
          debug_api_key: keys.debug.api_key || undefined,
          debug_api_key_configured: !!keys.debug.api_key,
          debug_webhook_secret: keys.debug.webhook_secret || undefined,
          production_api_key: keys.production.api_key || undefined,
          production_api_key_configured: !!keys.production.api_key,
          production_webhook_secret: keys.production.webhook_secret || undefined,
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

      toast({ title: "Configuração ASAAS salva!" })
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
      const apiKey = keys[environment].api_key || undefined

      const res = await fetch("/api/asaas/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          environment,
        }),
      })

      if (res.ok) {
        setTestResult("success")
        toast({ title: `Conexão com ASAAS (${ENVIRONMENTS.find(e => e.id === environment)?.label}) estabelecida!` })
      } else {
        const err = await res.json()
        setTestResult("error")
        toast({ title: "Falha na conexão", description: err.error || "Erro desconhecido", variant: "destructive" })
      }
    } catch (err: any) {
      setTestResult("error")
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }

  const activeEnv = ENVIRONMENTS.find(e => e.id === environment) || ENVIRONMENTS[0]

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              API ASAAS
            </CardTitle>
            <CardDescription>
              Configure a integração com o ASAAS para processamento de pagamentos — com suporte a múltiplos ambientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                AMBIENTE
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ENVIRONMENTS.map((env) => {
                  const Icon = env.icon
                  const isActive = environment === env.id
                  const isConfigured = keys[env.id].configured

                  return (
                    <button
                      key={env.id}
                      type="button"
                      onClick={() => setEnvironment(env.id)}
                      className={cn(
                        "relative text-left p-4 rounded-xl border-2 transition-all",
                        isActive
                          ? `${env.border} ${env.bg} shadow-sm`
                          : "border-border hover:border-muted-foreground/30 bg-muted/5",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          isActive ? env.bg : "bg-muted/30",
                        )}>
                          <Icon className={cn("h-5 w-5", isActive ? env.color : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-semibold",
                              isActive ? "text-foreground" : "text-muted-foreground",
                            )}>
                              {env.label}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                Ativo
                              </span>
                            )}
                            {isConfigured && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                                Configurado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{env.description}</p>
                          <p className="text-[10px] font-mono text-muted-foreground mt-1">{env.url}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Key className="h-4 w-4" />
                CREDENCIAIS — {activeEnv.label.toUpperCase()}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="asaas-api-key">Chave da API</Label>
                  <Input
                    id="asaas-api-key"
                    type="password"
                    value={currentKey.api_key}
                    onChange={(e) => setKeys((prev) => ({
                      ...prev,
                      [environment]: { ...prev[environment], api_key: e.target.value },
                    }))}
                    placeholder={currentKey.configured ? "••••••••" : "$a_sk_..."}
                    className="font-mono"
                  />
                  {currentKey.configured && !currentKey.api_key && (
                    <p className="text-xs text-muted-foreground">
                      Key atual: {maskKey(keys[environment].api_key)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para manter a chave existente
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="asaas-webhook-secret">Webhook Secret</Label>
                  <Input
                    id="asaas-webhook-secret"
                    type="password"
                    value={currentKey.webhook_secret}
                    onChange={(e) => setKeys((prev) => ({
                      ...prev,
                      [environment]: { ...prev[environment], webhook_secret: e.target.value },
                    }))}
                    placeholder={currentKey.configured ? "••••••••" : "whs_..."}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-2">
                <Label className="text-xs text-muted-foreground">URL do Webhook ({activeEnv.label})</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono px-3 py-2 rounded-lg bg-background border border-border truncate">
                    {`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/asaas`}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/asaas`,
                      )
                      toast({ title: "URL copiada!" })
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configure esta URL no painel do ASAAS &gt; Configurações &gt; Webhooks
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button onClick={testConnection} disabled={testing} variant="outline" className="gap-2">
                  {testing ? (
                    <>Testando...</>
                  ) : (
                    <>
                      <HelpCircle className="h-4 w-4" />
                      Testar Conexão ({activeEnv.label})
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
                {saving ? "Salvando..." : `Salvar Configuração (${activeEnv.label})`}
              </Button>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-600">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {environment === "production"
                  ? "Você está configurando o ambiente de Produção. Cobranças reais serão processadas."
                  : "Ambiente de Debug — nenhuma cobrança real será processada. Use para testes."}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
