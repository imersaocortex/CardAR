"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Loader2, X } from "lucide-react"
import { ArPlayer } from "@/components/ar/ar-player"
import { NoCamera, MarkerNotCompiled } from "@/components/ar/ar-fallbacks"
import type { ArExperienceData, ArState } from "@/lib/mindar"

export default function ExperiencePage() {
  const params = useParams()
  const [experience, setExperience] = useState<ArExperienceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [arState, setArState] = useState<ArState>("loading")

  useEffect(() => {
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
      } catch {
        setError("Erro ao carregar experiência")
      }
      setLoading(false)
    }
    load()
  }, [params.slug])

  const handleStateChange = useCallback((state: ArState) => {
    setArState(state)
  }, [])

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
      <ArPlayer experience={experience} onStateChange={handleStateChange} />
    </div>
  )
}
