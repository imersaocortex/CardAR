"use client"

import { useEffect, useRef, useState } from "react"
import { Download, X } from "lucide-react"

type InstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>
}

type InstallNavigator = Navigator & {
  standalone?: boolean
  getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>
}

type InstallMode = "prompt" | "ios" | null
type InstallWindow = Window & {
  __experienceInstallPrompt?: { event: InstallPromptEvent; path: string }
}

export function PwaInstallButton({ hidden = false }: { hidden?: boolean }) {
  const pendingPrompt = useRef<InstallPromptEvent | null>(null)
  const installedRef = useRef(false)
  const [installed, setInstalled] = useState(false)
  const [mode, setMode] = useState<InstallMode>(null)
  const [hint, setHint] = useState("")

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)")
    const isIosSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) &&
      /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
    let mounted = true

    async function syncInstalled() {
      const appNavigator = navigator as InstallNavigator
      const inApp = standalone.matches || appNavigator.standalone === true
      if (inApp) {
        installedRef.current = true
        setInstalled(true)
        setMode(null)
        return
      }
      try {
        const apps = await appNavigator.getInstalledRelatedApps?.()
        if (!mounted) return
        if (apps?.some((app) => app.platform === "webapp")) {
          installedRef.current = true
          setInstalled(true)
          setMode(null)
          return
        }
      } catch {
        // Browsers without this optional API still report installation via appinstalled.
      }
      if (mounted && !installedRef.current) setInstalled(false)
    }

    const syncPrompt = () => {
      const captured = (window as InstallWindow).__experienceInstallPrompt
      if (captured?.path !== window.location.pathname || installedRef.current) return
      pendingPrompt.current = captured.event
      setMode("prompt")
    }
    const frame = requestAnimationFrame(() => {
      void syncInstalled()
      if (isIosSafari && !standalone.matches) setMode("ios")
      syncPrompt()
    })
    standalone.addEventListener("change", syncInstalled)
    window.addEventListener("focus", syncInstalled)
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/experience-sw.js", { scope: "/experience/" }).catch(() => {})
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      if (installedRef.current) return
      pendingPrompt.current = event as InstallPromptEvent
      setMode("prompt")
    }
    const onInstalled = () => {
      pendingPrompt.current = null
      const installWindow = window as InstallWindow
      installWindow.__experienceInstallPrompt = undefined
      installedRef.current = true
      setInstalled(true)
      setMode(null)
      setHint("")
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("experience-install-available", syncPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      mounted = false
      cancelAnimationFrame(frame)
      standalone.removeEventListener("change", syncInstalled)
      window.removeEventListener("focus", syncInstalled)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("experience-install-available", syncPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  async function install() {
    if (mode === "ios") {
      setHint("No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.")
      return
    }
    const prompt = pendingPrompt.current
    if (!prompt) return
    pendingPrompt.current = null
    const installWindow = window as InstallWindow
    installWindow.__experienceInstallPrompt = undefined
    setMode(null)
    try {
      await prompt.prompt()
    } catch {
      setHint("Não foi possível iniciar a instalação. Atualize a página e tente novamente.")
    }
  }

  if (installed || hidden || (!mode && !hint)) return null
  return <div className="pointer-events-auto fixed bottom-24 left-4 z-50 max-w-[min(20rem,calc(100vw-2rem))] text-white">
    {hint && <div role="status" className="mb-2 rounded-xl border border-white/15 bg-slate-950/90 p-3 text-xs leading-relaxed shadow-xl backdrop-blur">
      <button type="button" onClick={() => setHint("")} aria-label="Fechar instruções de instalação" className="float-right ml-2 text-white/70"><X className="h-4 w-4" /></button>
      {hint}
    </div>}
    {mode && <button type="button" onClick={install} className="flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/70 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-colors hover:bg-slate-800/85" aria-label="Instalar esta experiência como aplicativo">
      <Download className="h-3.5 w-3.5" /> Instalar app
    </button>}
  </div>
}
