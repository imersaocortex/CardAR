"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Payout = { id: string; amount_cents: number; pix_key: string; status: string; requested_at: string; transfer_reference: string | null; profile: { name: string; email: string } | null }
type Settings = { enabled: boolean; rate_bps: number | null; fixed_cents: number | null; recurring: boolean; hold_days: number }
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function AffiliatesTab() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [references, setReferences] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [refundAlerts, setRefundAlerts] = useState<{ id: string; amount_cents: number; commission_id: string }[]>([])
  async function load() {
    try {
      const response = await fetch("/api/admin/affiliate-payouts")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setPayouts(data.payouts); setSettings(data.settings); setRefundAlerts(data.refundAlerts)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar repasses") }
  }
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/affiliate-payouts").then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (!cancelled) { setPayouts(data.payouts); setSettings(data.settings); setRefundAlerts(data.refundAlerts) }
    }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Falha ao carregar repasses") })
    return () => { cancelled = true }
  }, [])
  async function review(id: string, action: "paid" | "rejected") {
    setBusy(id); setMessage("")
    try {
      const response = await fetch("/api/admin/affiliate-payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, transfer_reference: references[id] }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setMessage(action === "paid" ? "Repasse registrado." : "Solicitação recusada; saldo devolvido ao afiliado.")
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao analisar saque") }
    finally { setBusy(null) }
  }
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Programa de afiliados</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{settings ? settings.enabled ? `${settings.rate_bps != null ? `${settings.rate_bps / 100}%` : money(settings.fixed_cents ?? 0)} por pagamento ${settings.recurring ? "incluindo renovações" : "inicial"}. Saque após ${settings.hold_days} dias.` : "Comissões desativadas até a regra ser configurada." : "Carregando regra…"}</CardContent></Card>
    {refundAlerts.length > 0 && <Card className="border-amber-500/50"><CardHeader><CardTitle>Devoluções após repasse</CardTitle></CardHeader><CardContent className="text-sm">{refundAlerts.length} comissão(ões) já pagas foram devolvidas pelo cliente. Confira a recuperação desses valores antes de novos repasses.{refundAlerts.map((item) => <p key={item.id} className="mt-2 font-mono text-xs">{item.commission_id} · {money(item.amount_cents)}</p>)}</CardContent></Card>}
    <Card><CardHeader><CardTitle>Solicitações de saque</CardTitle></CardHeader><CardContent className="space-y-4">
      <p role="status" className="text-sm">{message}</p>
      {payouts.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma solicitação até o momento.</p>}
      {payouts.map((payout) => <div key={payout.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{payout.profile?.name || "Afiliado"} · {money(payout.amount_cents)}</p><p className="text-sm text-muted-foreground">{payout.profile?.email} · solicitado em {new Date(payout.requested_at).toLocaleDateString("pt-BR")}</p></div><span className="text-sm">{({ requested: "Aguardando Pix", paid: "Pago", rejected: "Recusado" } as Record<string, string>)[payout.status] || payout.status}</span></div>
        <p className="mt-3 break-all rounded-lg bg-muted p-3 text-sm">Chave Pix: <strong>{payout.pix_key}</strong></p>
        {payout.status === "requested" && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Identificador do comprovante Pix" placeholder="Identificador do comprovante Pix" value={references[payout.id] || ""} onChange={(event) => setReferences((current) => ({ ...current, [payout.id]: event.target.value }))} /><Button disabled={busy === payout.id || (references[payout.id] || "").trim().length < 5} onClick={() => review(payout.id, "paid")}>Marcar como pago</Button><Button variant="outline" disabled={busy === payout.id} onClick={() => review(payout.id, "rejected")}>Recusar</Button></div>}
        {payout.transfer_reference && <p className="mt-2 text-xs text-muted-foreground">Comprovante: {payout.transfer_reference}</p>}
      </div>)}
    </CardContent></Card>
  </div>
}
