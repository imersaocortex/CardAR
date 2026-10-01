"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function PaymentsTab() {
  const [state, setState] = useState<{ paypal: { configured: boolean }; efi: { configured: boolean }; pixMode: string } | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetch("/api/billing/settings").then(async (res) => { if (!res.ok) throw new Error(); setState(await res.json()) }).catch(() => setError("Não foi possível consultar a configuração")) }, [])
  return <div className="space-y-5"><div><h2 className="text-xl font-semibold">PayPal e Efí Bank</h2><p className="mt-2 text-sm text-muted-foreground">Credenciais são configuradas no ambiente seguro do servidor. Nenhuma chave secreta é enviada ao navegador.</p></div>{error && <p role="alert">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle>PayPal</CardTitle></CardHeader><CardContent><p>{state ? state.paypal.configured ? "Configurado" : "Aguardando configuração" : "Consultando…"}</p><p className="mt-3 text-sm text-muted-foreground">Assinaturas recorrentes com aprovação no PayPal. O plano pode ser criado automaticamente ou vinculado na aba Planos.</p></CardContent></Card><Card><CardHeader><CardTitle>Efí Bank</CardTitle></CardHeader><CardContent><p>{state ? state.efi.configured ? "Configurado" : "Aguardando configuração" : "Consultando…"}</p><p className="mt-3 text-sm text-muted-foreground">{state?.pixMode === "automatic" ? "Pix Automático: primeiro pagamento e autorização para os períodos seguintes." : "Pix por período: QR Code e copia e cola para cada pagamento."}</p></CardContent></Card></div>
    <p className="text-sm text-muted-foreground">Antes de ativar cobranças reais, valide contratação, renovação e cancelamento em homologação. Assinaturas antigas precisam ser encerradas no provedor anterior para evitar cobranças em duplicidade.</p>
  </div>
}
