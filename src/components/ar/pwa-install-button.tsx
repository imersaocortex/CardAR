"use client"

import { useEffect, useRef, useState } from "react"
import { Download, X } from "lucide-react"

type InstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PwaInstallButton({ hidden = false }: { hidden?: boolean }) {
  const pendingPrompt = useRef<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [hint, setHint] = useState("")

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)")
    const syncInstalled = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
    const frame = requestAnimationFrame(syncInstalled)
    standalone.addEventListener("change", syncInstalled)
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/experience-sw.js", { scope: "/experience/" }).catch(() => {})
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      pendingPrompt.current = event as InstallPromptEvent
    }
    const onInstalled = () => { pendingPrompt.current = null; setInstalled(true); setHint("") }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      cancelAnimationFrame(frame)
      standalone.removeEventListener("change", syncInstalled)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  async function install() {
    const prompt = pendingPrompt.current
    if (!prompt) {
      setHint("Abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial, se disponível neste dispositivo.")
      return
    }
    pendingPrompt.current = null
    try {
      const result = await prompt.prompt()
      if (result.outcome === "dismissed") setHint("A instalação foi cancelada. Você pode tentar pelo menu do navegador.")
    } catch {
      setHint("Não foi possível abrir a instalação. Tente pelo menu do navegador.")
    }
  }

  if (installed || hidden) return null
  return <div className="pointer-events-auto fixed bottom-24 left-4 z-50 max-w-[min(20rem,calc(100vw-2rem))] text-white">
    {hint && <div role="status" className="mb-2 rounded-xl border border-white/15 bg-slate-950/90 p-3 text-xs leading-relaxed shadow-xl backdrop-blur">
      <button type="button" onClick={() => setHint("")} aria-label="Fechar instruções de instalação" className="float-right ml-2 text-white/70"><X className="h-4 w-4" /></button>
      {hint}
    </div>}
    <button type="button" onClick={install} className="flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/70 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-colors hover:bg-slate-800/85" aria-label="Instalar esta experiência como aplicativo">
      <Download className="h-3.5 w-3.5" /> Instalar app
    </button>
  </div>
}
