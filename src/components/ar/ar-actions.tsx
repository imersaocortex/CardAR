"use client"

import { useRef, useCallback, useState } from "react"
import { Camera, CameraOff, RotateCcw, Share2, Download } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface ArActionsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  onSwitchCamera?: () => void
  markerDetected: boolean
}

export function ArActions({ videoRef, containerRef, onSwitchCamera, markerDetected }: ArActionsProps) {
  const [lastCapture, setLastCapture] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const capturePhoto = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement("canvas")
    const video = videoRef.current
    if (video) {
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        // Draw the Three.js canvas overlay
        const threeCanvas = container.querySelector("canvas:not(video)") as HTMLCanvasElement | null
        if (threeCanvas) {
          ctx.drawImage(threeCanvas, 0, 0, canvas.width, canvas.height)
        }
      }
    } else {
      // Fallback: capture just the container
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }

    const dataUrl = canvas.toDataURL("image/png")
    setLastCapture(dataUrl)

    // Download
    const link = document.createElement("a")
    link.download = `ar-capture-${Date.now()}.png`
    link.href = dataUrl
    link.click()

    setTimeout(() => setLastCapture(null), 2000)
  }, [videoRef, containerRef])

  const startRecording = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      })

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.download = `ar-recording-${Date.now()}.webm`
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch {
      // User cancelled screen share or error
      setIsRecording(false)
    }
  }, [containerRef])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [])

  const share = useCallback(async () => {
    const currentUrl = window.location.href
    try {
      await navigator.share({
        title: "Experiência AR",
        text: "Veja esta experiência em Realidade Aumentada!",
        url: currentUrl,
      })
    } catch {
      // Web Share API not available or cancelled
      navigator.clipboard?.writeText(currentUrl).catch(() => {})
    }
  }, [])

  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <div className="flex items-center gap-4 bg-white/5 backdrop-blur-lg rounded-2xl px-4 py-2.5 border border-white/10">
          <ActionButton
            icon={<Camera className="h-4 w-4" />}
            label="Foto"
            onClick={capturePhoto}
          />
          <div className="w-px h-6 bg-white/10" />
          <ActionButton
            icon={
              isRecording ? (
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )
            }
            label={isRecording ? "Parar" : "Gravar"}
            onClick={isRecording ? stopRecording : startRecording}
          />
          <div className="w-px h-6 bg-white/10" />
          <ActionButton
            icon={<Share2 className="h-4 w-4" />}
            label="Compartilhar"
            onClick={share}
          />
          {onSwitchCamera && (
            <>
              <div className="w-px h-6 bg-white/10" />
              <ActionButton
                icon={<CameraOff className="h-4 w-4" />}
                label="Trocar"
                onClick={onSwitchCamera}
              />
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lastCapture && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-4"
          >
            <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-emerald-400 shadow-lg">
              <img src={lastCapture} alt="capture" className="w-full h-full object-cover" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex flex-col items-center gap-0.5 text-white/60 hover:text-white/90 transition-colors group"
      onClick={onClick}
    >
      <div className="group-hover:scale-110 transition-transform">{icon}</div>
      <span className="text-[10px]">{label}</span>
    </button>
  )
}
