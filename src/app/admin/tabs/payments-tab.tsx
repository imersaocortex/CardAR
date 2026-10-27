"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

type Data = {
  settings: { asaas_enabled: boolean; asaas_pix_key: string | null; has_api_key: boolean; mercado_pago_enabled: boolean }
  environment: { production: boolean; missing: string[] }
  mercadoPagoEnvironment: { production: boolean; missing: string[] }
  canStoreKey: boolean
}
type Webhook = { configured: boolean; enabled: boolean; interrupted: boolean; missingEvents: string[] }

export function PaymentsTab() {
  const [data, setData] = useState<Data | null>(null)
  const [webhook, setWebhook] = useState<Webhook | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pixKey, setPixKey] = useState("")
  const [apiKey, setApiKey] = useState("")
  useEffect(() => {
    fetch("/api/admin/billing-providers", { cache: "no-store" }).then(async (response) => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar os pagamentos")
      setData(result)
      setPixKey(result.settings.asaas_pix_key || "")
    }).catch((reason) => setError(reason.message))
  }, [])
  async function change(enabled: boolean) {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar")
      setData((current) => current ? { ...current, settings: result.settings } : current)
      setNotice(enabled ? "Pix Automático ativado para novas assinaturas." : "Novas assinaturas desativadas. O histórico permanece disponível.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  async function changeMercadoPago(enabled: boolean) {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mercado_pago_enabled: enabled }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar")
      setData((current) => current ? { ...current, settings: result.settings } : current)
      setNotice(enabled ? "Pix Mercado Pago ativado para novas assinaturas." : "Pix Mercado Pago desativado para novas assinaturas.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  async function handleWebhook(action: "verify_webhook" | "register_webhook") {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a Asaas")
      setWebhook(result.webhook)
      setNotice(result.webhook.configured ? "Webhook da Asaas configurado." : "Webhook incompleto ou desativado.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  async function savePixKey() {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pix_key: pixKey }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a chave Pix")
      setData((current) => current ? { ...current, settings: result.settings } : current)
      setNotice("Chave Pix de referência salva.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  async function saveApiKey() {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: apiKey }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a chave de API")
      setApiKey("")
      setData((current) => current ? { ...current, settings: { ...current.settings, has_api_key: true }, environment: {
        ...current.environment, missing: current.environment.missing.filter((item) => item !== "Chave de API da Asaas"),
      } } : current)
      setNotice("Chave de API criptografada e salva. Confira o webhook antes de ativar cobranças.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Meios de pagamento</h2><p className="mt-2 text-sm text-muted-foreground">Ative os provedores que deseja oferecer para novas assinaturas.</p></div>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">{notice}</p>}
    <Card><CardHeader><CardTitle>Pix Automático · Asaas</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><p className="font-medium">Aceitar novas assinaturas</p><p className="text-xs text-muted-foreground">{data?.environment.production ? "Produção" : "Homologação"}</p></div><Switch aria-label="Ativar Pix Automático Asaas" checked={!!data?.settings.asaas_enabled} disabled={!data || busy || (!data.settings.asaas_enabled && data.environment.missing.length > 0)} onCheckedChange={change} /></div>
      <p className="text-sm text-muted-foreground">O primeiro QR Code autoriza a recorrência. A Asaas gera as cobranças futuras, e o sistema confirma cada pagamento antes de liberar o acesso.</p>
      <div className="space-y-2 rounded-lg border p-3"><label htmlFor="asaas-pix-key" className="text-sm font-medium">Chave Pix recebedora</label><Input id="asaas-pix-key" autoComplete="off" value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="Informe sua chave Pix" maxLength={255} disabled={!data || busy} /><p className="text-xs text-muted-foreground">Referência administrativa opcional. O Pix Automático usa o QR Code gerado pela Asaas; esta chave não é enviada nas cobranças.</p><Button type="button" variant="outline" size="sm" disabled={!data || busy || pixKey === (data.settings.asaas_pix_key || "")} onClick={savePixKey}>Salvar chave Pix</Button></div>
      <div className="space-y-2 rounded-lg border p-3"><label htmlFor="asaas-api-key" className="text-sm font-medium">Chave de API da Asaas</label><Input id="asaas-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={data?.settings.has_api_key ? "Chave configurada — informe outra para substituir" : "Cole a chave de API"} maxLength={1000} disabled={!data || busy || !data.canStoreKey} /><p className="text-xs text-muted-foreground">{data?.settings.has_api_key ? "Configurada. O valor não pode ser visualizado após salvar." : "Ainda não configurada."} A chave é criptografada antes de ser armazenada.</p>{data && !data.canStoreKey && <p className="text-xs text-amber-600">Configure ASAAS_SECRETS_KEY na Vercel para habilitar o armazenamento seguro.</p>}<Button type="button" variant="outline" size="sm" disabled={!data || busy || !data.canStoreKey || apiKey.trim().length < 20} onClick={saveApiKey}>Salvar chave de API</Button></div>
      {!!data?.environment.missing.length && <p className="text-xs text-amber-600">Para ativar, configure: {data.environment.missing.join(", ")}.</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!data || busy} onClick={() => handleWebhook("verify_webhook")}>Verificar webhook</Button><Button type="button" variant="outline" size="sm" disabled={!data || busy} onClick={() => handleWebhook("register_webhook")}>Configurar webhook</Button></div>
      {webhook && <p className="text-xs text-muted-foreground">{webhook.configured ? "Recebimento pronto" : webhook.interrupted ? "Fila interrompida" : `${webhook.missingEvents.length} eventos pendentes`}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Pix por fatura · Mercado Pago</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><p className="font-medium">Aceitar novas assinaturas</p><p className="text-xs text-muted-foreground">{data?.mercadoPagoEnvironment.production ? "Produção" : "Homologação"}</p></div><Switch aria-label="Ativar Pix Mercado Pago" checked={!!data?.settings.mercado_pago_enabled} disabled={!data || busy || (!data.settings.mercado_pago_enabled && data.mercadoPagoEnvironment.missing.length > 0)} onCheckedChange={changeMercadoPago} /></div>
      <p className="text-sm text-muted-foreground">Cada ciclo gera um novo Pix. O cliente precisa pagá-lo no app do banco. Ao vencer sem pagamento confirmado, os projetos são bloqueados até a quitação.</p>
      {!!data?.mercadoPagoEnvironment.missing.length && <p className="text-xs text-amber-600">Para ativar, configure: {data.mercadoPagoEnvironment.missing.join(", ")}.</p>}
      <p className="text-xs text-muted-foreground">Configure o webhook de Pagamentos em Suas integrações do Mercado Pago para /api/webhooks/mercado-pago. Cadastre o Access Token e a chave secreta do webhook como variáveis protegidas na Vercel.</p>
    </CardContent></Card>
    <p className="text-sm text-muted-foreground">Os pagamentos históricos dos provedores anteriores continuam disponíveis para auditoria. O WhatsApp usa a conexão Evolution já configurada no sistema.</p>
  </div>
}
