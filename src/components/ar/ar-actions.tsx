"use client"

import { useRef, useCallback, useState } from "react"
import { Camera, CameraOff, RotateCcw, Share2, ScanLine } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { QrScanner } from "./qr-scanner"

interface ArActionsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  onSwitchCamera?: () => void
  markerDetected: boolean
}

export function ArActions({ videoRef, containerRef, onSwitchCamera, markerDetected }: ArActionsProps) {
  const [lastCapture, setLastCapture] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordAnimRef = useRef(0)
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null)

  function drawCompositedFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const video = videoRef.current
    const container = containerRef.current
    if (!container) return

    // Draw camera video filling the canvas (object-fit: cover)
    if (video && video.videoWidth > 0) {
      const vw = video.videoWidth
      const vh = video.videoHeight
      const scale = Math.max(w / vw, h / vh)
      const cropW = w / scale
      const cropH = h / scale
      const cropX = (vw - cropW) / 2
      const cropY = (vh - cropH) / 2
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, w, h)
    }

    // Draw Three.js overlay at screen size
    const threeCanvas = container.querySelector("canvas:not(video)") as HTMLCanvasElement | null
    if (threeCanvas) {
      ctx.drawImage(threeCanvas, 0, 0, w, h)
    }
  }

  const capturePhoto = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const w = container.clientWidth
    const h = container.clientHeight
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (ctx) {
      drawCompositedFrame(ctx, w, h)
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
    const video = videoRef.current
    if (!container || !video) return

    const w = container.clientWidth
    const h = container.clientHeight
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    recordCanvasRef.current = canvas
    const ctx = canvas.getContext("2d")!
    const fps = 30

    const mimeTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    const selectedMime = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || ""

    let stream: MediaStream | null = null
    try {
      stream = canvas.captureStream(fps)
    } catch {
      // Fallback: try getDisplayMedia (desktop only)
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser" },
          audio: false,
        })
      } catch {
        setIsRecording(false)
        return
      }
    }

    if (!stream) {
      setIsRecording(false)
      return
    }

    const mediaRecorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined)
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    const stopStream = () => {
      stream!.getTracks().forEach((t) => t.stop())
    }

    mediaRecorder.onstop = () => {
      cancelAnimationFrame(recordAnimRef.current)
      const blob = new Blob(chunksRef.current, { type: "video/webm" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.download = `ar-recording-${Date.now()}.webm`
      link.href = url
      link.click()
      URL.revokeObjectURL(url)
      stopStream()
      recordCanvasRef.current = null
    }

    const composite = () => {
      recordAnimRef.current = requestAnimationFrame(composite)
      ctx.clearRect(0, 0, w, h)
      drawCompositedFrame(ctx, w, h)
    }

    if (stream && (stream as any).getVideoTracks) {
      // canvas.captureStream path - composite needed
      composite()
    }

    mediaRecorder.start()
    setIsRecording(true)
  }, [containerRef, videoRef])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
    cancelAnimationFrame(recordAnimRef.current)
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

  const handleQrScan = useCallback((data: string) => {
    setScannerOpen(false)
    const value = data.trim()

    // Extract an /experience/:slug URL from the scanned content
    const expMatch = value.match(/\/experience\/([a-zA-Z0-9_-]+)/)
    if (expMatch?.[1]) {
      const slug = expMatch[1]
      window.location.href = `${window.location.origin}/experience/${slug}`
      return
    }

    // If it looks like a full http(s) URL, open it
    if (/^https?:\/\//i.test(value)) {
      const win = window.open(value, "_blank", "noopener,noreferrer")
      if (!win) window.location.href = value
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
          <div className="w-px h-6 bg-white/10" />
          <ActionButton
            icon={<ScanLine className="h-4 w-4" />}
            label="Scan QR"
            onClick={() => setScannerOpen(true)}
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

      {scannerOpen && (
        <QrScanner
          onClose={() => setScannerOpen(false)}
          onScan={handleQrScan}
        />
      )}
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
