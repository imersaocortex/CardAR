"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

type Method = "pix_automatico" | "credit_card"
type Module = "syncpay_pix_enabled" | "syncpay_card_enabled" | "mercado_pago_enabled"
type Environment = { missing: string[] }
type Data = {
  settings: Record<Module, boolean>
  syncPayEnvironment: Environment; syncPayCardEnvironment: Environment; mercadoPagoEnvironment: Environment
  plans: { id: string; name: string; price: number; billing_cycle: string }[]
  links: { plan_id: string; method: Method; external_token: string }[]
  pending: { id: string; plan_id: string }[]
  events: { id: string; event: string; last_error: string | null }[]
}
const modules: { key: Module; name: string; detail: string; environment: "syncPayEnvironment" | "syncPayCardEnvironment" | "mercadoPagoEnvironment" }[] = [
  { key: "syncpay_pix_enabled", name: "Pix Automático · Sync Pay", detail: "O cliente autoriza no banco uma vez. A Sync Pay processa as próximas cobranças.", environment: "syncPayEnvironment" },
  { key: "syncpay_card_enabled", name: "Cartão recorrente · Sync Pay", detail: "O cliente cadastra o cartão no formulário seguro da Sync Pay, com cobrança a cada ciclo.", environment: "syncPayCardEnvironment" },
  { key: "mercado_pago_enabled", name: "Pix por fatura · Mercado Pago", detail: "Cada mensalidade ou anuidade exige o pagamento de um novo Pix.", environment: "mercadoPagoEnvironment" },
]
export function PaymentsTab() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [recovery, setRecovery] = useState<Record<string, string>>({})
  async function load() {
    const response = await fetch("/api/admin/billing-providers", { cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    setData(result)
    setTokens(Object.fromEntries(result.links.map((link: Data["links"][number]) => [`${link.plan_id}:${link.method}`, link.external_token])))
  }
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/billing-providers", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (!controller.signal.aborted) {
        setData(result)
        setTokens(Object.fromEntries(result.links.map((link: Data["links"][number]) => [`${link.plan_id}:${link.method}`, link.external_token])))
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [])
  async function save(method: string, body: unknown) {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/admin/billing-providers", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      await load()
      setNotice("Configuração salva e conferida.")
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Módulos de recebimento</h2><p className="mt-2 text-sm text-muted-foreground">Escolha quais opções serão oferecidas para novas assinaturas. Ao desligar um módulo, os contratos existentes continuam sendo conciliados.</p></div>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">{notice}</p>}
    {modules.map(module => <Card key={module.key}><CardHeader><CardTitle>{module.name}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><p className="font-medium">Aceitar novas assinaturas</p><p className="text-xs text-muted-foreground">{data?.settings[module.key] ? "Ativado" : "Desativado"}</p></div><Switch aria-label={`Ativar ${module.name}`} checked={!!data?.settings[module.key]} disabled={!data || busy || (!data.settings[module.key] && data[module.environment].missing.length > 0)} onCheckedChange={enabled => save("PATCH", { module: module.key, enabled })} /></div>
      <p className="text-sm text-muted-foreground">{module.detail} O acesso depende da confirmação do pagamento.</p>
      {!!data?.[module.environment].missing.length && <p className="text-xs text-amber-600">Configure na Vercel: {data[module.environment].missing.join(", ")}.</p>}
    </CardContent></Card>)}
    <Card><CardHeader><CardTitle>Vincular planos à Sync Pay</CardTitle></CardHeader><CardContent className="space-y-5">
      <p className="text-sm text-muted-foreground">Crie os planos na Sync Pay com o mesmo preço e informe o token de cada modalidade abaixo. A recorrência é de 30 dias para mensal e 365 dias para anual. Valor, modalidade e intervalo serão conferidos na API antes de salvar.</p>
      {data?.plans.map(plan => <div key={plan.id} className="space-y-3 rounded-xl border p-4"><p className="font-medium">{plan.name} · {Number(plan.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} / {plan.billing_cycle === "yearly" ? "365 dias" : "30 dias"}</p>
        {(["pix_automatico", "credit_card"] as Method[]).map(method => { const key = `${plan.id}:${method}`; return <div key={method} className="space-y-2"><label className="text-sm" htmlFor={key}>{method === "credit_card" ? "Cartão recorrente" : "Pix Automático"} — token do plano</label><div className="flex flex-col gap-2 sm:flex-row"><Input id={key} value={tokens[key] || ""} onChange={event => setTokens(current => ({ ...current, [key]: event.target.value }))} placeholder="UUID do plano na Sync Pay" disabled={busy} /><Button variant="outline" disabled={busy} onClick={() => save("PUT", { plan_id: plan.id, method, external_token: (tokens[key] || "").trim() })}>Validar e salvar</Button></div></div> })}
      </div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Conferência de adesões</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Se uma conexão falhar durante a adesão, confira a assinatura no painel Sync Pay e informe seu token para recuperá-la sem repetir a cobrança.</p>
      {data?.pending.map(item => <div className="space-y-2 rounded-lg border p-3" key={item.id}><p className="break-all text-xs">Adesão: {item.id}</p><Input aria-label={`Token da assinatura para ${item.id}`} placeholder="Token da assinatura criada na Sync Pay" value={recovery[item.id] || ""} onChange={event => setRecovery(current => ({ ...current, [item.id]: event.target.value }))} /><Button variant="outline" disabled={busy || !recovery[item.id]} onClick={() => save("POST", { action: "recover", agreement_id: item.id, subscription_token: recovery[item.id].trim() })}>Conferir e recuperar</Button></div>)}
      {!data?.pending.length && <p className="text-sm text-muted-foreground">Nenhuma adesão aguardando recuperação.</p>}
      {!!data?.events.length && <p className="text-sm text-amber-600">{data.events.length} notificações aguardam conciliação. A rotina agendada tenta novamente; confira as credenciais e as assinaturas no provedor.</p>}
    </CardContent></Card>
    <p className="text-sm text-muted-foreground">Webhook Sync Pay: <code>/api/webhooks/syncpay</code>. Use os eventos de assinaturas e cobranças com o segredo em SYNC_PAY_WEBHOOK_SECRET, ou a lista JSON em SYNC_PAY_WEBHOOK_SECRETS quando os eventos tiverem segredos diferentes. Libere Pix Automático, cartão, iFrame e o domínio com a Sync Pay antes de ativar. Os dados completos do cartão ficam no formulário do provedor.</p>
    <p className="text-sm text-muted-foreground">Asaas foi substituída para novas contratações. O histórico e a conciliação dos contratos anteriores foram preservados. Os avisos WhatsApp continuam usando a Evolution configurada.</p>
  </div>
}
