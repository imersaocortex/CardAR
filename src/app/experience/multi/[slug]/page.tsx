"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { ArPlayer } from "@/components/ar/ar-player"
import { PwaInstallButton } from "@/components/ar/pwa-install-button"
import { CardboardToggle } from "@/components/ar/cardboard-toggle"
import type { ArExperienceData } from "@/lib/mindar"

const GpsPlayer = dynamic(() => import("@/components/ar/gps-player").then((module) => module.GpsPlayer), { ssr: false })

type CollectionData = {
  collection: { id: string; name: string; trackingMode: "marker" | "gps" }
  projects: ArExperienceData[]
  hasWatermark: boolean
  siteName: string
}

export default function MultiExperiencePage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<CollectionData | null>(null)
  const [error, setError] = useState("")
  const [cardboard, setCardboard] = useState(false)
  const sessionId = useRef(`multi_${crypto.randomUUID()}`)
  useEffect(() => {
    let alive = true
    fetch(`/api/experience/multi/${encodeURIComponent(slug)}`).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Experiência indisponível")
      if (alive) {
        setData(body)
        for (const project of body.projects as ArExperienceData[]) {
          void fetch("/api/analytics/log", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: project.id, session_id: sessionId.current, event_type: "view", metadata: { collection_id: body.collection.id } }),
          })
        }
      }
    }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "Erro ao carregar") })
    return () => { alive = false }
  }, [slug])

  const interaction = useCallback((eventType: string, metadata?: Record<string, unknown>) => {
    if (!data) return
    const projectId = typeof metadata?.project_id === "string" ? metadata.project_id : data.projects[0].id
    void fetch("/api/analytics/log", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, session_id: sessionId.current, event_type: eventType, metadata: { ...metadata, collection_id: data.collection.id } }),
    })
  }, [data])

  if (error) return <main className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white"><div><h1 className="text-xl font-semibold">Experiência indisponível</h1><p className="mt-2 text-sm text-white/70">{error}</p></div></main>
  if (!data) return <main className="flex min-h-screen items-center justify-center bg-black text-white">Carregando experiência…</main>
  const first = { ...data.projects[0], name: data.collection.name }
  if (data.collection.trackingMode === "gps") return <><GpsPlayer experience={first} experiences={data.projects} hasWatermark={data.hasWatermark} siteName={data.siteName} onInteraction={interaction} cardboard={cardboard} vrControl={<CardboardToggle active={false} trackingMode="gps" onChange={setCardboard} inline />} /><PwaInstallButton hidden={cardboard} />{cardboard && <CardboardToggle active trackingMode="gps" onChange={setCardboard} />}</>
  return <><ArPlayer experience={first} experiences={data.projects} hasWatermark={data.hasWatermark} siteName={data.siteName} onInteraction={interaction} cardboard={cardboard} vrControl={<CardboardToggle active={false} trackingMode="marker" onChange={setCardboard} inline />} /><PwaInstallButton hidden={cardboard} />{cardboard && <CardboardToggle active trackingMode="marker" onChange={setCardboard} />}</>
}
