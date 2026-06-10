"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Loader2, X } from "lucide-react"
import { ArPlayer } from "@/components/ar/ar-player"
import { NoCamera, MarkerNotCompiled } from "@/components/ar/ar-fallbacks"
import type { ArExperienceData, ArState } from "@/lib/mindar"

function generateSessionId(): string {
  return "sess_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

async function sendAnalytics(
  projectId: string,
  eventType: string,
  metadata?: Record<string, any>,
  sessionId?: string,
) {
  try {
    await fetch("/api/analytics/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        session_id: sessionId,
        event_type: eventType,
        metadata: metadata || {},
      }),
    })
  } catch {}
}

export default function ExperiencePage() {
  const params = useParams()
  const [experience, setExperience] = useState<ArExperienceData | null>(null)
  const [hasWatermark, setHasWatermark] = useState(true)
  const [siteName, setSiteName] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [arState, setArState] = useState<ArState>("loading")
  const sessionIdRef = useRef(generateSessionId())
  const trackedRef = useRef({ view: false, detected: false })

  useEffect(() => {
    trackedRef.current = { view: false, detected: false }
    sessionIdRef.current = generateSessionId()

    async function load() {
      try {
        const res = await fetch(`/api/experience/${params.slug}`)
        if (!res.ok) {
          const text = await res.text()
          setError(text.includes("não") ? "Experiência não encontrada" : "Erro ao carregar")
          setLoading(false)
          return
        }
        const data = await res.json()
        if (!data.project) {
          setError("Experiência não encontrada")
          setLoading(false)
          return
        }
        setExperience(data.project)
        setHasWatermark(data.hasWatermark !== false)
        setSiteName(data.siteName || "")

        // Track initial view
        sendAnalytics(data.project.id, "view", {}, sessionIdRef.current)
        trackedRef.current.view = true
      } catch {
        setError("Erro ao carregar experiência")
      }
      setLoading(false)
    }
    load()
  }, [params.slug])

  const handleStateChange = useCallback((state: ArState) => {
    setArState(state)

    // Track marker detection
    if (state === "detected" && experience && !trackedRef.current.detected) {
      trackedRef.current.detected = true
      sendAnalytics(experience.id, "click", { action: "marker_detected" }, sessionIdRef.current)
    }
  }, [experience])

  const handleInteraction = useCallback((eventType: string, metadata?: Record<string, any>) => {
    if (!experience) return
    sendAnalytics(experience.id, eventType, metadata, sessionIdRef.current)
  }, [experience])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !experience) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <X className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Experiência não encontrada</h2>
          <p className="text-sm text-white/60">{error}</p>
        </div>
      </div>
    )
  }

  if (!experience.marker?.targetUrl) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <MarkerNotCompiled />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-0">
      <ArPlayer
        experience={experience}
        hasWatermark={hasWatermark}
        siteName={siteName}
        onStateChange={handleStateChange}
        onInteraction={handleInteraction}
      />
    </div>
  )
}
