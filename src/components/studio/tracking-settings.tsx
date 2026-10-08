"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"

export function TrackingSettings({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState("marker")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [radius, setRadius] = useState("100")
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    createClient().from("projects").select("tracking_mode, latitude, longitude, activation_radius").eq("id", projectId).single().then(({ data, error }) => {
      if (cancelled) return
      if (error) { toast({ title: "Não foi possível carregar as configurações", variant: "destructive" }); return }
      setMode(data.tracking_mode); setLatitude(data.latitude == null ? "" : String(data.latitude)); setLongitude(data.longitude == null ? "" : String(data.longitude)); setRadius(String(data.activation_radius)); setLoaded(true)
    })
    return () => { cancelled = true }
  }, [open, projectId])
  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/tracking`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracking_mode: mode, latitude: latitude.trim() ? Number(latitude) : null, longitude: longitude.trim() ? Number(longitude) : null, activation_radius: Number(radius) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: "Modo de experiência salvo", variant: "success" }); setOpen(false)
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Falha ao salvar", variant: "destructive" }) }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) setLoaded(false) }}><DialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled}>Modo AR</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Como a experiência aparece?</DialogTitle><DialogDescription>Configure o rastreamento sem alterar os objetos da cena.</DialogDescription></DialogHeader>
      <Label htmlFor="tracking-mode">Modo de realidade aumentada</Label>
      <select id="tracking-mode" className="h-11 rounded-md border bg-background px-3" value={mode} onChange={(event) => setMode(event.target.value)} disabled={!loaded || busy}>
        <option value="marker">Imagem / marcador</option><option value="surface">Superfície: chão ou mesa</option><option value="gps">GPS: direção das coordenadas</option>
      </select>
      {mode === "surface" && <p className="text-sm text-muted-foreground">Requer um dispositivo com suporte a WebXR AR e detecção de superfícies. A cena será posicionada em metros.</p>}
      {mode === "gps" && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Usa GPS e bússola para exibir a cena na direção do ponto. A precisão varia conforme o aparelho e o ambiente.</p>
        <Label htmlFor="latitude">Latitude (−90 a 90)</Label><Input id="latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
        <Label htmlFor="longitude">Longitude (−180 a 180)</Label><Input id="longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
        <Label htmlFor="radius">Raio de proximidade (metros)</Label><Input id="radius" type="number" min="10" max="5000" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <p className="text-xs text-muted-foreground">A cena aparece somente dentro deste raio e acompanha a distância do celular até as coordenadas.</p>
        <Button variant="outline" onClick={() => navigator.geolocation?.getCurrentPosition(({ coords }) => { setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude)) }, () => toast({ title: "Não foi possível obter sua localização", variant: "destructive" }), { enableHighAccuracy: true, timeout: 15000 })}>Usar minha localização</Button>
      </div>}
      <Button onClick={save} disabled={!loaded || busy}>{busy ? "Salvando…" : "Salvar configuração"}</Button>
    </DialogContent></Dialog>
}
