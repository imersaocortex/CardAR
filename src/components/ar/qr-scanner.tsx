"use client"

import { useEffect, useRef, useState } from "react"
import { X, Loader2, ScanLine } from "lucide-react"
import jsQR from "jsqr"

interface QrScannerProps {
  onClose: () => void
  onScan: (data: string) => void
}

export function QrScanner({ onClose, onScan }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [error, setError] = useState("")
  const [found, setFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    let raf = 0

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()

        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return

        let lastScan = 0

        const tick = () => {
          if (cancelled) return
          raf = requestAnimationFrame(tick)
          if (!scanningRef.current) return
          const now = Date.now()
          if (now - lastScan < 150) return
          lastScan = now
          if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            })
            if (code?.data) {
              scanningRef.current = false
              setFound(true)
              onScan(code.data)
            }
          }
        }
        tick()
      } catch {
        if (!cancelled) {
          setError("Não foi possível acessar a câmera para ler o QR Code.")
        }
      }
    }

    init()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="relative flex-1">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl border-4 border-emerald-400/80" />
            <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
          </div>
        </div>

        <div className="absolute top-4 inset-x-0 flex justify-center">
          <div className="px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-emerald-400" />
            <span className="text-white/90 text-xs">Aponte para o QR Code</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-6 bg-black">
        {error ? (
          <div className="text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : found ? (
          <div className="flex items-center justify-center gap-3 text-emerald-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">QR Code lido! Redirecionando...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Buscando QR Code...</span>
          </div>
        )}
      </div>
    </div>
  )
}
