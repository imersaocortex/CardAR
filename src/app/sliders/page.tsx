"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, ExternalLink, Images, Link2, Plus, X } from "lucide-react"
import Link from "next/link"
import { AppShell } from "@/components/layout/app-shell"
import { SliderCarousel } from "@/components/sliders/slider-carousel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { sliderDraftSchema, sliderFormats, sliderLink, type SliderDraft, type SliderLibrary, type SliderRow } from "@/lib/sliders/model"
import { sliderTransitionLabels, sliderTransitions } from "@/lib/sliders/transitions"

const emptyDraft: SliderDraft = { name: "", width: 1080, height: 1080, fit: "contain", transition: "none", assetIds: [] }

export default function SlidersPage() {
  const [library, setLibrary] = useState<SliderLibrary>()
  const [loadingError, setLoadingError] = useState("")
  const [active, setActive] = useState<SliderRow>()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [assetId, setAssetId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const request = new AbortController()
    fetch("/api/sliders", { signal: request.signal }).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setLibrary(body)
    }).catch(() => {
      if (!request.signal.aborted) setLoadingError("Não foi possível carregar os sliders. Atualize a página para tentar novamente.")
    })
    return () => request.abort()
  }, [])

  function edit(slider?: SliderRow) {
    setActive(slider)
    setDraft(slider ? { ...slider.draft, transition: slider.draft.transition ?? "none" } : emptyDraft)
    setAssetId("")
    setError("")
    setEditing(true)
  }

  function move(index: number, offset: number) {
    setDraft((current) => {
      const assetIds = [...current.assetIds]
      const target = index + offset
      if (target < 0 || target >= assetIds.length) return current
      ;[assetIds[index], assetIds[target]] = [assetIds[target], assetIds[index]]
      return { ...current, assetIds }
    })
  }

  async function save(action: "draft" | "publish" | "unpublish") {
    if (busy) return
    const parsed = sliderDraftSchema.safeParse(draft)
    if (action !== "unpublish" && !parsed.success) {
      setError("Informe um nome e dimensões entre 200 e 2048 px, com proporção entre 1:4 e 4:1.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/sliders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action === "unpublish" ? "unpublish" : "save",
          id: active?.id,
          version: active?.updated_at,
          draft: parsed.success ? parsed.data : undefined,
          publish: action === "publish",
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      const saved: SliderRow = result
      setLibrary((current) => current ? { ...current, sliders: [saved, ...current.sliders.filter((slider) => slider.id !== saved.id)] } : current)
      setActive(saved)
      if (parsed.success && action !== "unpublish") setDraft(parsed.data)
      toast({ title: action === "publish" ? "Slider publicado" : action === "unpublish" ? "Publicação retirada" : "Rascunho salvo" })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar o slider.")
    } finally {
      setBusy(false)
    }
  }

  const assets = new Map(library?.assets.map((asset) => [asset.id, asset]))
  const images = draft.assetIds.flatMap((id) => {
    const asset = assets.get(id)
    return asset ? [asset] : []
  })
  const dimensions = sliderFormats.find(({ width, height }) => width === draft.width && height === draft.height)?.id ?? "custom"
  const validPreview = draft.width > 0 && draft.height > 0 && draft.width / draft.height >= 0.25 && draft.width / draft.height <= 4
  const selectClass = "block h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"

  return <AppShell>
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sliders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crie carrosséis para compartilhar por link ou usar em realidade aumentada.</p>
        </div>
        {library?.enabled && library.canEdit && <Button variant="gradient" onClick={() => edit()} disabled={busy}><Plus className="size-4" /> Novo slider</Button>}
      </header>
      {loadingError ? <p role="alert" className="text-sm text-destructive">{loadingError}</p> : !library ? <p role="status">Carregando sliders…</p> : !library.enabled ? (
        <p className="rounded-xl border bg-card p-5 text-sm">O recurso Sliders interativos está indisponível para este plano. <Link className="text-cyan-300 underline" href="/billing">Ver assinatura</Link></p>
      ) : <div className="grid items-start gap-5 xl:grid-cols-[minmax(14rem,1fr)_minmax(0,2.3fr)]">
        <ul className="min-w-0 space-y-2">
          {library.sliders.length === 0 && <li className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum slider criado.</li>}
          {library.sliders.map((slider) => (
            <li key={slider.id} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold">{slider.draft.name}</p>
                <span className={`text-xs ${slider.published ? "text-emerald-300" : "text-muted-foreground"}`}>{slider.published ? "Publicado" : "Rascunho"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {library.canEdit && <Button size="sm" variant={active?.id === slider.id ? "secondary" : "outline"} disabled={busy} onClick={() => edit(slider)}>Editar</Button>}
                {slider.published && <>
                  <Button size="sm" variant="ghost" asChild><a href={sliderLink(slider.slug)} target="_blank" rel="noopener noreferrer">Abrir <ExternalLink className="size-3" /></a></Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(new URL(sliderLink(slider.slug), window.location.origin).href)
                      toast({ title: "Link copiado" })
                    } catch {
                      toast({ title: "Não foi possível copiar. Abra o slider e copie o endereço.", variant: "destructive" })
                    }
                  }}><Link2 className="size-3" /> Copiar link</Button>
                </>}
              </div>
            </li>
          ))}
        </ul>

        {editing && library.canEdit && <section className="min-w-0 space-y-5 rounded-2xl border bg-card p-4 sm:p-6" aria-label="Editor de slider">
          <h2 className="font-semibold">{active ? "Editar slider" : "Novo slider"}</h2>
          <fieldset className="min-w-0 space-y-4" disabled={busy}>
            <div className="space-y-1.5">
              <Label htmlFor="slider-name">Nome</Label>
              <Input id="slider-name" maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="slider-format">Formato</Label>
                <select id="slider-format" className={selectClass} value={dimensions} onChange={(event) => {
                  const format = sliderFormats.find(({ id }) => id === event.target.value)
                  setDraft({ ...draft, width: format?.width ?? 1000, height: format?.height ?? 1000 })
                }}>
                  {sliderFormats.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
                  <option value="custom">Personalizado</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slider-fit">Encaixe da imagem</Label>
                <select id="slider-fit" className={selectClass} value={draft.fit} onChange={(event) => setDraft({ ...draft, fit: event.target.value === "cover" ? "cover" : "contain" })}>
                  <option value="contain">Mostrar imagem inteira</option>
                  <option value="cover">Preencher o quadro</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="slider-width">Largura (px)</Label><Input id="slider-width" type="number" min={200} max={2048} value={draft.width || ""} onChange={(event) => setDraft({ ...draft, width: Number(event.target.value) })} /></div>
              <div className="space-y-1.5"><Label htmlFor="slider-height">Altura (px)</Label><Input id="slider-height" type="number" min={200} max={2048} value={draft.height || ""} onChange={(event) => setDraft({ ...draft, height: Number(event.target.value) })} /></div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="slider-transition">Efeito de transição</Label>
                <select id="slider-transition" className={selectClass} value={draft.transition} onChange={(event) => {
                  const transition = sliderTransitions.find((effect) => effect === event.target.value)
                  if (transition) setDraft({ ...draft, transition })
                }}>
                  {sliderTransitions.map((effect) => <option key={effect} value={effect}>{sliderTransitionLabels[effect]}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slider-assets">Imagens ({draft.assetIds.length}/20)</Label>
              <div className="flex gap-2">
                <select id="slider-assets" className={selectClass} value={assetId} onChange={(event) => setAssetId(event.target.value)}>
                  <option value="">Selecione um asset</option>
                  {library.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </select>
                <Button type="button" variant="outline" disabled={!assetId || draft.assetIds.length >= 20} onClick={() => { setDraft({ ...draft, assetIds: [...draft.assetIds, assetId] }); setAssetId("") }}>Adicionar</Button>
              </div>
              <Link href="/assets" target="_blank" className="inline-flex items-center gap-1 text-xs text-cyan-300 underline"><Images className="size-3" /> Abrir biblioteca de imagens</Link>
              <ol className="space-y-1">
                {draft.assetIds.map((id, index) => <li key={`${id}-${index}`} className="flex items-center gap-1 rounded-lg border px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-sm">{index + 1}. {assets.get(id)?.name ?? "Imagem indisponível"}</span>
                  <Button size="icon" variant="ghost" aria-label={`Subir imagem ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Descer imagem ${index + 1}`} disabled={index === draft.assetIds.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Remover imagem ${index + 1}`} onClick={() => setDraft({ ...draft, assetIds: draft.assetIds.filter((_, position) => position !== index) })}><X className="size-4" /></Button>
                </li>)}
              </ol>
            </div>
          </fieldset>
          {validPreview && <SliderCarousel key={draft.assetIds.join(",")} content={{ name: draft.name || "Prévia do slider", width: draft.width, height: draft.height, fit: draft.fit, transition: draft.transition, images }} />}
          {active?.published && <p className="text-xs text-muted-foreground">Salvar o rascunho mantém a versão pública atual. Use Publicar para atualizar o link e as experiências vinculadas.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => save("draft")} disabled={busy}>Salvar rascunho</Button>
            <Button variant="gradient" onClick={() => save("publish")} disabled={busy || images.length < 2}>Publicar</Button>
            {active?.published && <Button variant="ghost" onClick={() => save("unpublish")} disabled={busy}>Retirar publicação</Button>}
          </div>
        </section>}
      </div>}
    </div>
  </AppShell>
}
