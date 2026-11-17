"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { SliderContent } from "@/lib/sliders/model"
import { activeSliderTransition, sliderMotion, sliderTransitionDuration, sliderTransitionEasing, type AnimatedSliderTransition } from "@/lib/sliders/transitions"

type SlidePosition = {
  index: number
  transition?: { from: number; direction: number; effect: AnimatedSliderTransition }
}

export function SliderCarousel({ content }: { content: SliderContent }) {
  const [position, setPosition] = useState<SlidePosition>({ index: 0 })
  const start = useRef<{ id: number; x: number; y: number } | null>(null)
  const incoming = useRef<HTMLDivElement>(null)
  const outgoing = useRef<HTMLDivElement>(null)
  const count = content.images.length
  const index = count ? position.index % count : 0
  const move = (direction: number) => {
    if (count < 2) return
    const effect = incoming.current?.animate ? activeSliderTransition(content.transition) : null
    setPosition((current) => current.transition ? current : {
      index: (current.index + direction + count) % count,
      transition: effect ? { from: current.index % count, direction, effect } : undefined,
    })
  }
  useLayoutEffect(() => {
    const transition = position.transition
    if (!transition || !incoming.current || !outgoing.current) return
    const { effect, direction } = transition
    const animate = (node: HTMLDivElement, enter: boolean) => node.animate([0, 1].map((progress) => {
      const { offset, scale, opacity } = sliderMotion(effect, direction, progress, enter)
      return { transform: `translateX(${offset * 100}%) scale(${scale})`, opacity }
    }), { duration: sliderTransitionDuration, easing: sliderTransitionEasing, fill: "both" })
    const exit = animate(outgoing.current, false)
    const enter = animate(incoming.current, true)
    enter.onfinish = () => setPosition({ index: position.index })
    return () => {
      enter.onfinish = null
      enter.cancel()
      exit.cancel()
    }
  }, [position])

  const layers = position.transition ? [position.transition.from, index] : [index]
  return (
    <section
      aria-label={content.name}
      className="relative isolate mx-auto w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-950 outline-offset-4 focus-visible:outline-2 focus-visible:outline-cyan-300"
      style={{ aspectRatio: `${content.width} / ${content.height}`, maxWidth: `min(100%, ${72 * content.width / content.height}dvh)` }}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          move(event.key === "ArrowLeft" ? -1 : 1)
        }
      }}
    >
      <div
        className="absolute inset-0 grid touch-pan-y select-none place-items-center text-sm text-white/65"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return
          start.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { start.current = null }}
        onPointerUp={(event) => {
          const from = start.current
          start.current = null
          if (!from || from.id !== event.pointerId) return
          const dx = event.clientX - from.x
          const dy = event.clientY - from.y
          if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1)
        }}
      >
        {count ? layers.map((layer) => (
          <div
            key={layer}
            ref={layer === index ? incoming : outgoing}
            aria-hidden={layer !== index || undefined}
            className="absolute inset-0 grid place-items-center bg-slate-950"
          >
            <SlideImage image={content.images[layer]} fit={content.fit} />
          </div>
        )) : "Adicione imagens para ver a prévia"}
      </div>
      {count > 1 && <>
        <button type="button" aria-label="Imagem anterior" onClick={() => move(-1)} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-slate-950/80 text-white hover:bg-slate-800"><ChevronLeft aria-hidden="true" /></button>
        <button type="button" aria-label="Próxima imagem" onClick={() => move(1)} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-slate-950/80 text-white hover:bg-slate-800"><ChevronRight aria-hidden="true" /></button>
        <span aria-live="polite" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/85 px-3 py-1 text-xs tabular-nums text-white">{index + 1} / {count}</span>
      </>}
    </section>
  )
}

function SlideImage({ image, fit }: { image: SliderContent["images"][number]; fit: SliderContent["fit"] }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <p>Imagem indisponível</p>
  // The asset already lives in the image library. Use its original aspect ratio and transparency.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.url} alt={image.name} draggable={false} onError={() => setFailed(true)} className="pointer-events-none size-full" style={{ objectFit: fit }} />
}
