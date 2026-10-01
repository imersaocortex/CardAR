"use client"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/lib/format"
import { Check, CreditCard, RefreshCw } from "lucide-react"
import Image from "next/image"
import QRCode from "qrcode"

type Plan = { id: string; name: string; price: number; billing_cycle: string; projects_limit: number; features: string[] }
type Agreement = { id: string; provider: "paypal" | "efi"; pix_mode: string; status: string; checkout_url: string | null; pix_code: string | null }
type Billing = { plans: Plan[]; subscription: { status: string; current_period_end: string; trial_ends_at: string | null; cancel_at_period_end: boolean; plans: Plan }; agreement: Agreement | null; charges: { id: string; status: string; pix_code: string | null; expires_at: string | null; kind: string }[]; payments: { id: string; provider: string; value: number; status: string; due_date: string; paid_date: string | null }[]; usage: { projects_used: number; projects_limit: number }; canManage: boolean }
type Availability = { paypal: { configured: boolean }; efi: { configured: boolean }; pixMode: "manual" | "automatic" }
const money = (value: number | string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const statuses: Record<string, string> = { active: "Ativa", pending: "Aguardando pagamento", trialing: "Período de teste", past_due: "Pagamento em atraso", canceled: "Cancelada", paid: "Pago", refunded: "Reembolsado", CONFIRMED: "Pago", RECEIVED: "Pago", PENDING: "Pendente" }
function isInitialExpired(billing: Billing) {
  const charge = billing.charges.find((item) => item.kind === "immediate")
  return !!(charge?.expires_at && charge.status !== "paid" && Date.parse(charge.expires_at) <= Date.now())
}

export default function BillingPage() {
  const [data, setData] = useState<Billing | null>(null)
  const [available, setAvailable] = useState<Availability | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [selected, setSelected] = useState<Plan | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [qr, setQr] = useState("")
  const [initialExpired, setInitialExpired] = useState(false)
  async function load() {
    const [billing, settings] = await Promise.all([fetch("/api/billing"), fetch("/api/billing/settings")])
    const body = await billing.json()
    if (!billing.ok) throw new Error(body.error)
    setData(body)
    setInitialExpired(isInitialExpired(body))
    if (settings.ok) setAvailable(await settings.json())
  }
  useEffect(() => {
    let cancelled = false
    const refresh = () => Promise.all([fetch("/api/billing"), fetch("/api/billing/settings")]).then(async ([billing, settings]) => {
      const body = await billing.json()
      if (!billing.ok) throw new Error(body.error)
      const options = settings.ok ? await settings.json() : null
      if (!cancelled) { setData(body); setAvailable(options); setInitialExpired(isInitialExpired(body)) }
    }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Falha ao carregar") })
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  const pendingCharge = data?.charges.find((charge) => charge.status === "pending")
  const paymentsAvailable = !!(available?.paypal.configured || available?.efi.configured)
  const pixCode = data?.agreement?.status === "pending" && data.agreement.pix_mode === "automatic" ? initialExpired ? null : data.agreement.pix_code : pendingCharge?.pix_code
  useEffect(() => {
    let cancelled = false
    if (pixCode) QRCode.toDataURL(pixCode, { width: 256, margin: 2 }).then((url) => { if (!cancelled) setQr(url) }).catch(() => {})
    return () => { cancelled = true }
  }, [pixCode])
  async function act(action: string, provider?: "paypal" | "efi") {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, plan_id: selected?.id, payment_provider: provider }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setSelected(null); setCancelOpen(false)
      if (result.checkout_url) { window.location.assign(result.checkout_url); return }
      await load()
      setMessage(action === "cancel" ? "Renovação cancelada. O acesso continua até o fim do período já pago." : action === "reset" ? result.settled ? "Pagamento confirmado. Sua assinatura foi atualizada." : "Autorização expirada encerrada. Escolha o plano para gerar uma nova." : action === "sync" ? "Situação consultada no provedor. O acesso depende da confirmação do pagamento." : "Cobrança preparada. Conclua o pagamento abaixo.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação") }
    finally { setBusy(false) }
  }
  return <AppShell><div className="mx-auto max-w-6xl space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-primary">Sua assinatura</p><h1 className="mt-2 text-3xl font-semibold">Escolha o próximo passo.</h1></div>{data?.agreement && data.canManage && <Button variant="outline" disabled={busy} onClick={() => act("sync")}><RefreshCw className="mr-2 h-4 w-4" />Verificar pagamento</Button>}</div>
    {message && <p role="status" className="rounded-xl border bg-card p-4 text-sm">{message}</p>}
    {!data && !message && <p>Carregando faturamento…</p>}
    {data && <>
      {!paymentsAvailable && <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">Novas assinaturas estão temporariamente indisponíveis. Seus projetos e o plano atual continuam acessíveis.</p>}
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-5 pt-6"><div><p className="text-sm text-muted-foreground">Plano atual</p><h2 className="text-xl font-medium">{data.subscription.plans?.name} · {statuses[data.subscription.status] || data.subscription.status}</h2><p className="mt-2 text-sm text-muted-foreground">{data.usage.projects_used} de {data.usage.projects_limit} projetos · {data.subscription.status === "trialing" ? `Teste até ${formatDate(data.subscription.trial_ends_at)}` : `Período até ${formatDate(data.subscription.current_period_end)}`}</p>{data.subscription.cancel_at_period_end && <p className="mt-2 text-sm text-amber-300">Renovação cancelada.</p>}</div>{data.agreement?.status !== "canceled" && data.agreement && data.canManage && <Button variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>Cancelar renovação</Button>}</CardContent></Card>
      {pixCode && <Card><CardHeader><CardTitle>{data.agreement?.pix_mode === "automatic" ? "Autorize o Pix Automático" : "Pague com Pix"}</CardTitle></CardHeader><CardContent className="flex flex-col items-start gap-4 sm:flex-row">{qr && <Image unoptimized src={qr} width={220} height={220} alt="QR Code Pix para pagamento" className="rounded-xl" />}<div className="min-w-0 flex-1 space-y-4"><p className="text-sm text-muted-foreground">{data.agreement?.pix_mode === "automatic" ? "No aplicativo do seu banco, confira o primeiro pagamento e autorize as cobranças futuras. A autorização, sozinha, não confirma o pagamento." : "Copie o código ou escaneie o QR Code no aplicativo do seu banco. No Pix manual, cada período exige um novo pagamento."}</p><textarea aria-label="Código Pix copia e cola" readOnly value={pixCode} className="h-24 w-full rounded-lg border bg-background p-3 text-xs" /><Button onClick={() => navigator.clipboard.writeText(pixCode).then(() => setMessage("Código Pix copiado")).catch(() => setMessage("Selecione e copie o código acima"))}>Copiar código Pix</Button></div></CardContent></Card>}
      {initialExpired && data.agreement?.pix_mode === "automatic" && data.agreement.status === "pending" && data.canManage && <Card><CardContent className="space-y-3 pt-6"><p>O QR Code expirou. Confira o pagamento e, se não tiver sido confirmado, inicie uma nova autorização.</p><Button disabled={busy} onClick={() => act("reset")}>Gerar nova autorização</Button></CardContent></Card>}
      {data.agreement?.status === "pending" && data.agreement.checkout_url && <Button asChild><a href={data.agreement.checkout_url} rel="noopener noreferrer">Continuar no PayPal</a></Button>}
      {data.agreement?.provider === "efi" && data.agreement.pix_mode === "manual" && data.agreement.status !== "canceled" && data.canManage && <Button disabled={busy} onClick={() => act("renew")}>Gerar Pix do próximo período</Button>}
      <div className="grid gap-5 md:grid-cols-3">{data.plans.map((plan) => <Card key={plan.id} className="flex flex-col"><CardHeader><CardTitle>{plan.name}</CardTitle><p className="pt-3 text-3xl font-semibold">{money(plan.price)}<span className="text-sm font-normal text-muted-foreground">/{plan.billing_cycle === "yearly" ? "ano" : "mês"}</span></p></CardHeader><CardContent className="flex flex-1 flex-col"><ul className="mb-6 flex-1 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check className="h-4 w-4 shrink-0 text-cyan-400" />{feature}</li>)}</ul><Button disabled={busy || !paymentsAvailable || !data.canManage || plan.price <= 0 || (!!data.agreement && data.agreement.status !== "canceled")} onClick={() => setSelected(plan)}>Assinar {plan.name}</Button></CardContent></Card>)}</div>
      {!data.canManage && <p className="text-sm text-muted-foreground">Peça ao responsável pela organização para gerenciar a assinatura.</p>}
      <Card><CardHeader><CardTitle>Histórico de pagamentos</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-3">Data</th><th>Provedor</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{data.payments.map((payment) => <tr key={payment.id} className="border-b border-border/40"><td className="py-4">{formatDate(payment.paid_date || payment.due_date)}</td><td>{({ paypal: "PayPal", efi: "Efí Pix", asaas: "Histórico ASAAS", stripe: "Histórico Stripe" })[payment.provider] || payment.provider}</td><td>{money(payment.value)}</td><td>{statuses[payment.status] || payment.status}</td></tr>)}</tbody></table>{!data.payments.length && <p className="py-5 text-muted-foreground">Nenhum pagamento registrado.</p>}</CardContent></Card>
    </>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent><DialogHeader><DialogTitle>Assinar {selected?.name}</DialogTitle><DialogDescription>O pagamento inicial é cobrado agora. O período gratuito já utilizado não é reiniciado na contratação.</DialogDescription></DialogHeader><Button disabled={busy || !available?.paypal.configured} onClick={() => act("upgrade", "paypal")}><CreditCard className="mr-2 h-4 w-4" />PayPal · assinatura recorrente</Button><Button variant="outline" disabled={busy || !available?.efi.configured} onClick={() => act("upgrade", "efi")}>Efí · {available?.pixMode === "automatic" ? "Pix Automático" : "Pix por período"}</Button>{!available?.paypal.configured && !available?.efi.configured && <p className="text-sm text-muted-foreground">As formas de pagamento estão sendo configuradas.</p>}</DialogContent></Dialog>
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Cancelar a renovação?</DialogTitle><DialogDescription>As próximas cobranças serão interrompidas. Seu acesso continua pelo período já pago.</DialogDescription></DialogHeader><Button variant="destructive" disabled={busy} onClick={() => act("cancel")}>Confirmar cancelamento</Button><Button variant="outline" onClick={() => setCancelOpen(false)}>Manter assinatura</Button></DialogContent></Dialog>
  </div></AppShell>
}
