"use client"
import { useEffect, useRef, useState } from "react"

export function SyncPayCard({ planId, onToken }: { planId: string; onToken: (token: string) => void }) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const callback = useRef(onToken)
  const submitted = useRef(false)
  const [url, setUrl] = useState("")
  const [height, setHeight] = useState(440)
  const [error, setError] = useState("")
  useEffect(() => { callback.current = onToken }, [onToken])
  useEffect(() => {
    let canceled = false
    fetch(`/api/billing/syncpay-card?plan_id=${encodeURIComponent(planId)}`, { cache: "no-store" }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      if (!canceled) setUrl(body.url)
    }).catch(reason => { if (!canceled) setError(reason.message) })
    return () => { canceled = true }
  }, [planId])
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://app.syncpayments.com.br" || event.source !== iframe.current?.contentWindow || event.data?.source !== "syncpay-embed") return
      const body = event.data
      if (body.type === "resize" && Number.isFinite(body.height)) setHeight(Math.max(300, Math.min(900, body.height)))
      if (body.type === "error") setError("O formulário do cartão não carregou. Confira a liberação e o domínio com a Sync Pay.")
      if (body.type === "token" && !submitted.current) {
        if (body.method !== "card" || typeof body.token !== "string" || !body.token.startsWith("card_token.")) {
          setError("Para esta assinatura, utilize cartão de crédito no formulário."); return
        }
        submitted.current = true
        callback.current(body.token)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Preencha seu cartão no formulário seguro da Sync Pay. A contratação autoriza a cobrança recorrente do plano selecionado.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {url && <iframe ref={iframe} src={url} title="Pagamento seguro por cartão Sync Pay" allow="payment" style={{ width: "100%", height, border: 0 }} />}
  </div>
}
