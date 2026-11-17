"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStudioStore } from "@/store"
import { parseSliderLink } from "@/lib/sliders/model"
import type { StudioElement } from "@/types"

export function SliderPicker({ element }: { element: StudioElement }) {
  const library = useStudioStore((state) => state.sliderLibrary)
  const updateElement = useStudioStore((state) => state.updateElement)
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const choices = library?.choices ?? []
  const linked = choices.some(({ id }) => id === element.sliderId)

  if (!library?.enabled) return <p className="text-xs text-muted-foreground">Vínculo de sliders indisponível neste projeto ou plano.</p>

  return <div className="space-y-2 rounded-lg border p-3">
    <Label htmlFor="studio-slider-choice" className="text-xs">Slider publicado</Label>
    <select id="studio-slider-choice" className="h-8 w-full rounded-md border bg-card px-2 text-xs" value={linked ? element.sliderId : ""}
      onChange={(event) => {
        updateElement(element.id, { sliderId: event.target.value })
        setError("")
      }}>
      <option value="" disabled>{element.sliderId && !linked ? "Slider vinculado indisponível" : "Selecione um slider"}</option>
      {choices.map(({ id, content }) => <option value={id} key={id}>{content.name}</option>)}
    </select>
    <Label htmlFor="studio-slider-link" className="text-xs">Ou cole o link de um slider da sua conta</Label>
    <div className="flex gap-1.5">
      <Input id="studio-slider-link" className="min-w-0 text-xs" value={link} placeholder="https://…/sliders/…" onChange={(event) => setLink(event.target.value)} />
      <Button type="button" size="sm" variant="outline" disabled={!link.trim()} onClick={() => {
        const slug = parseSliderLink(link, window.location.origin)
        const slider = choices.find((item) => item.slug === slug)
        if (!slider) {
          setError("Selecione um link publicado pelo CortexAR nesta organização.")
          return
        }
        updateElement(element.id, { sliderId: slider.id })
        setLink("")
        setError("")
      }}>Vincular</Button>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Link href="/sliders" target="_blank" className="text-xs text-cyan-300 underline">Gerenciar sliders</Link>
  </div>
}
