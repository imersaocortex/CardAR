"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

type Provider = "efi" | "paypal"
type Data = {
  settings: { efi_enabled: boolean; paypal_enabled: boolean }
  environment: { pixMode: string; efiProduction: boolean; paypalProduction: boolean; efiMissing: string[]; paypalMissing: string[] }
}
type Webhooks = { pix: boolean; rec: boolean; cobr: boolean }

export function PaymentsTab() {
  const [data, setData] = useState<Data | null>(null)
  const [webhooks, setWebhooks] = useState<Webhooks | null>(null)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    fetch("/api/admin/billing-providers", { cache: "no-store" }).then(async (response) => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar os pagamentos")
      setData(result)
    }).catch((reason) => setError(reason.message))
  }, [])

  async function change(provider: Provider, enabled: boolean) {
    setBusy(provider); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, enabled }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar")
      setData((current) => current ? { ...current, settings: result.settings } : current)
      setNotice(`${provider === "efi" ? "Pix Automático Efí" : "PayPal"} ${enabled ? "ativado" : "desativado"} para novas assinaturas. Assinaturas existentes continuam sendo conciliadas.`)
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy("") }
  }

  async function handleWebhooks(action: "verify_webhooks" | "register_webhooks") {
    setBusy(action); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a Efí")
      setWebhooks(result.webhooks)
      setNotice(Object.values(result.webhooks as Webhooks).every(Boolean) ? "Os três webhooks estão vinculados a esta aplicação." : "Ainda há webhooks ausentes ou apontando para outro endereço.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy("") }
  }

  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Meios de pagamento</h2><p className="mt-2 text-sm text-muted-foreground">Ative cada provedor separadamente. As credenciais ficam nas variáveis seguras da Vercel e não são exibidas aqui.</p></div>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Pix Automático · Efí Bank</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><p className="font-medium">Aceitar novas assinaturas</p><p className="text-xs text-muted-foreground">{data?.environment.efiProduction ? "Ambiente de produção" : "Ambiente de homologação"}</p></div><Switch aria-label="Ativar Pix Automático Efí" checked={!!data?.settings.efi_enabled} disabled={!data || !!busy || (!data.settings.efi_enabled && data.environment.efiMissing.length > 0)} onCheckedChange={(checked) => change("efi", checked)} /></div>
        <p className="text-sm text-muted-foreground">Primeiro Pix por QR Code com autorização das cobranças seguintes. Modo atual: {data?.environment.pixMode === "automatic" ? "automático" : "manual"}.</p>
        {data?.environment.efiMissing.length ? <p className="text-xs text-amber-600">Para ativar, configure: {data.environment.efiMissing.join(", ")}.</p> : <p className="text-xs text-emerald-600">Variáveis obrigatórias presentes. Verifique os webhooks antes de ativar.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!data || !!busy || data.environment.efiMissing.length > 0} onClick={() => handleWebhooks("verify_webhooks")}>Verificar webhooks</Button><Button type="button" variant="outline" size="sm" disabled={!data || !!busy || data.environment.efiMissing.length > 0} onClick={() => handleWebhooks("register_webhooks")}>Configurar webhooks</Button></div>
        {webhooks && <p className="text-xs text-muted-foreground">Pix inicial: {webhooks.pix ? "ok" : "pendente"} · Autorização: {webhooks.rec ? "ok" : "pendente"} · Renovação: {webhooks.cobr ? "ok" : "pendente"}</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>PayPal</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><p className="font-medium">Aceitar novas assinaturas</p><p className="text-xs text-muted-foreground">{data?.environment.paypalProduction ? "Ambiente de produção" : "Ambiente de homologação"}</p></div><Switch aria-label="Ativar PayPal" checked={!!data?.settings.paypal_enabled} disabled={!data || !!busy || (!data.settings.paypal_enabled && data.environment.paypalMissing.length > 0)} onCheckedChange={(checked) => change("paypal", checked)} /></div>
        <p className="text-sm text-muted-foreground">Fica desligado até você configurar as credenciais e o webhook do PayPal.</p>
        {!!data?.environment.paypalMissing.length && <p className="text-xs text-amber-600">Para ativar, configure: {data.environment.paypalMissing.join(", ")}.</p>}
      </CardContent></Card>
    </div>
    <p className="text-sm text-muted-foreground">Desativar um provedor impede novas contratações. Pagamentos, cancelamentos e renovações já existentes continuam sendo tratados pela rotina de conciliação.</p>
  </div>
}
