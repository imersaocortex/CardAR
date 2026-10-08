"use client"

import { useEffect, useState } from "react"
import { Glasses, X } from "lucide-react"

export function CardboardToggle({ active, trackingMode, onChange }: {
  active: boolean
  trackingMode: "marker" | "gps" | "surface"
  onChange: (active: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState("")

  useEffect(() => {
    if (!active) return
    const onFullscreenChange = () => { if (!document.fullscreenElement) { screen.orientation?.unlock?.(); onChange(false) } }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [active, onChange])

  async function enterCardboard() {
    setOpen(false)
    setHint("")
    onChange(true)
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(() => {})
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: "landscape") => Promise<void> }
    await orientation?.lock?.("landscape").catch(() => {})
  }

  async function toggle() {
    if (!active) { setOpen((value) => !value); setHint(""); return }
    onChange(false)
    screen.orientation?.unlock?.()
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  }

  return <div className="pointer-events-auto fixed bottom-24 right-4 z-50 max-w-[min(19rem,calc(100vw-2rem))] text-white">
    {(open || hint) && <div className="mb-2 rounded-xl border border-white/20 bg-slate-950/95 p-3 text-xs leading-relaxed shadow-xl backdrop-blur" role="status">
      {open ? <><p className="mb-1 font-semibold">Abrir nos óculos</p><p className="mb-2 text-white/65">Use o celular na horizontal. Ative som ou posicione a cena antes de colocá-lo nos óculos.</p>
        <button type="button" onClick={enterCardboard} className="block w-full rounded-lg bg-cyan-500 px-3 py-2 text-left font-medium text-slate-950">Óculos com smartphone</button>
        {trackingMode === "surface"
          ? <button type="button" onClick={() => { setOpen(false); setHint("No Meta Quest Browser, toque em Iniciar AR na superfície para abrir a experiência imersiva com visão do ambiente.") }} className="mt-2 block w-full rounded-lg border border-white/20 px-3 py-2 text-left">Meta Quest · superfícies</button>
          : <p className="mt-2 text-white/65">Meta Quest: este modo usa câmera ou GPS do smartphone e não está disponível no navegador dos óculos.</p>}
      </> : <>{hint}<button type="button" onClick={() => setHint("")} aria-label="Fechar instrução" className="ml-2 inline-flex align-middle"><X className="h-4 w-4" /></button></>}
    </div>}
    <button type="button" onClick={toggle} aria-pressed={active} aria-expanded={open} className="ml-auto flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/75 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-colors hover:bg-slate-800/90">
      {active ? <X className="h-3.5 w-3.5" /> : <Glasses className="h-3.5 w-3.5" />}
      {active ? "Sair VR" : "Óculos VR"}
    </button>
  </div>
}
