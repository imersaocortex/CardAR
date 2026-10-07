import { isPublicHlsUrl } from "./hls-url"

export async function attachHlsSource(video: HTMLVideoElement, source: string, onError?: (message: string) => void): Promise<() => void> {
  if (!isPublicHlsUrl(source)) throw new Error("Informe uma URL HTTPS pública terminada em .m3u8")

  video.crossOrigin = "anonymous"
  video.playsInline = true
  const { default: Hls } = await import("hls.js")
  if (Hls.isSupported()) {
    const hls = new Hls()
    let recoveryAttempted = false
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return
      if (!recoveryAttempted && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        recoveryAttempted = true
        hls.recoverMediaError()
      } else if (!recoveryAttempted && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        recoveryAttempted = true
        hls.startLoad()
      } else {
        onError?.("Não foi possível carregar o streaming HLS. Confira a URL e a liberação CORS do servidor.")
      }
    })
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(source))
    hls.attachMedia(video)
    return () => {
      hls.destroy()
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = source
    video.load()
    return () => {
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }
  throw new Error("Este navegador não suporta streaming HLS")
}
