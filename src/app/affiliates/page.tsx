"use client"

import { useEffect, useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Link2, Users, ArrowUpRight } from "lucide-react"

export default function AffiliatesPage() {
  const [link, setLink] = useState("")
  const [signups, setSignups] = useState(0)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState("")
  const [pixKey, setPixKey] = useState("")
  const [balance, setBalance] = useState({ pending: 0, available: 0, requested: 0, paid: 0 })
  const [payouts, setPayouts] = useState<{ id: string; amount_cents: number; status: string; requested_at: string }[]>([])
  const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  async function load(method = "GET") {
    try {
      const res = await fetch("/api/affiliates", { method })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLink(data.link?.active ? `${window.location.origin}/r/${data.link.code}` : "")
      setSignups(data.signups)
      setBalance(data.balance)
      setPayouts(data.payouts)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar") }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let cancelled = false
    fetch("/api/affiliates").then(async (res) => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (!cancelled) { setLink(data.link?.active ? `${window.location.origin}/r/${data.link.code}` : ""); setSignups(data.signups); setBalance(data.balance); setPayouts(data.payouts) }
    }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Falha ao carregar") })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [])
  async function requestPayout() {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payout", pix_key: pixKey }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setBalance(data.balance); setPayouts(data.payouts); setPixKey(""); setMessage("Saque solicitado. Aguarde a transferência Pix pela administração.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao solicitar saque") }
    finally { setBusy(false) }
  }
  return <AppShell><div className="mx-auto max-w-4xl space-y-8">
    <div><p className="mb-3 text-xs uppercase tracking-[0.25em] text-primary">Cresça com a comunidade</p><h1 className="text-3xl font-semibold">Suas indicações, em um só lugar.</h1><p className="mt-3 text-muted-foreground">Compartilhe a plataforma com clientes e parceiros e acompanhe os cadastros pelo seu link.</p></div>
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-6">
      <Link2 className="mb-4 text-primary" /><h2 className="text-lg font-medium">Seu link de indicação</h2>
      <p className="mt-2 mb-5 text-sm text-muted-foreground">A primeira indicação é considerada por até 30 dias, no mesmo navegador, antes do cadastro.</p>
      {link ? <div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Link de indicação" readOnly value={link} onFocus={(e) => e.target.select()} /><Button onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Link copiado!") } catch { setMessage("Selecione e copie o link acima.") } }}>Copiar link</Button></div> : <Button disabled={busy} onClick={() => { setBusy(true); setMessage(""); void load("POST") }}>Gerar meu link <ArrowUpRight className="ml-2 h-4 w-4" /></Button>}
      <p role="status" className="mt-3 text-sm">{message}</p>
    </div>
    <div className="rounded-2xl border p-6"><Users className="mb-3 text-primary" /><p className="text-4xl font-semibold">{signups}</p><p className="mt-2 text-muted-foreground">Cadastros indicados</p></div>
    <div className="grid gap-4 sm:grid-cols-4">{([["Em liberação", balance.pending], ["Disponível", balance.available], ["Saque solicitado", balance.requested], ["Pago", balance.paid]] as const).map(([label, value]) => <div key={label} className="rounded-2xl border p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{money(value)}</p></div>)}</div>
    <div className="rounded-2xl border p-6"><h2 className="text-lg font-medium">Solicitar saque por Pix</h2><p className="mt-2 text-sm text-muted-foreground">As comissões ficam disponíveis 30 dias após o pagamento confirmado. A transferência é feita manualmente pela administração.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Input aria-label="Chave Pix para o saque" placeholder="Sua chave Pix" value={pixKey} onChange={(event) => setPixKey(event.target.value)} /><Button disabled={busy || balance.available <= 0 || pixKey.trim().length < 5} onClick={requestPayout}>Solicitar {money(balance.available)}</Button></div></div>
    {payouts.length > 0 && <div className="rounded-2xl border p-6"><h2 className="mb-3 text-lg font-medium">Solicitações de saque</h2>{payouts.map((payout) => <p key={payout.id} className="border-t py-3 text-sm">{new Date(payout.requested_at).toLocaleDateString("pt-BR")} · {money(payout.amount_cents)} · {({ requested: "Em análise", paid: "Pago", rejected: "Recusado" } as Record<string, string>)[payout.status] || payout.status}</p>)}</div>}
  </div></AppShell>
}
