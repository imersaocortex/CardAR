import * as THREE from "three"
import { imagePlaneSize } from "./object-geometry"
import type { SliderContent } from "../sliders/model"

export function createSliderMesh(slider: SliderContent, opacity: number) {
  const canvas = document.createElement("canvas")
  const scale = Math.min(1, 1024 / Math.max(slider.width, slider.height))
  canvas.width = Math.max(1, Math.round(slider.width * scale))
  canvas.height = Math.max(1, Math.round(slider.height * scale))
  const context = canvas.getContext("2d")
  if (!context || !slider.images.length) return null

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(...imagePlaneSize(slider.width, slider.height)),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity }),
  )
  const images = new Map<number, HTMLImageElement>()
  let index = 0
  let disposed = false
  let started = false
  const count = slider.images.length
  const wrap = (value: number) => (value + count) % count

  function paint() {
    if (disposed || !context) return
    const { width, height } = canvas
    context.fillStyle = "#0b1324"
    context.fillRect(0, 0, width, height)
    const frame = images.get(index)
    if (frame?.complete && frame.naturalWidth > 0) {
      const fit = slider.fit === "cover" ? Math.max : Math.min
      const ratio = fit(width / frame.naturalWidth, height / frame.naturalHeight)
      const w = frame.naturalWidth * ratio
      const h = frame.naturalHeight * ratio
      context.drawImage(frame, (width - w) / 2, (height - h) / 2, w, h)
    } else {
      context.fillStyle = "#e2e8f0"
      context.font = `600 ${Math.round(Math.min(width, height) * 0.045)}px system-ui`
      context.textAlign = "center"
      context.fillText(frame?.complete ? "Imagem indisponível" : "Carregando imagem…", width / 2, height * 0.36, width * 0.9)
    }
    if (count > 1) {
      const size = Math.min(width, height) * 0.078
      for (const direction of [-1, 1]) {
        const x = width * (direction < 0 ? 0.12 : 0.88)
        const y = height / 2
        context.beginPath()
        context.arc(x, y, size, 0, Math.PI * 2)
        context.fillStyle = "rgba(3, 9, 23, 0.86)"
        context.fill()
        context.beginPath()
        context.moveTo(x - direction * size * 0.2, y - size * 0.42)
        context.lineTo(x + direction * size * 0.25, y)
        context.lineTo(x - direction * size * 0.2, y + size * 0.42)
        context.lineWidth = Math.max(2, size * 0.14)
        context.lineCap = "round"
        context.lineJoin = "round"
        context.strokeStyle = "#ffffff"
        context.stroke()
      }
      context.fillStyle = "rgba(3, 9, 23, 0.86)"
      context.fillRect(width / 2 - size * 1.4, height - size * 1.25, size * 2.8, size * 0.9)
      context.fillStyle = "#ffffff"
      context.font = `600 ${Math.round(size * 0.45)}px system-ui`
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillText(`${index + 1} / ${count}`, width / 2, height - size * 0.8)
      context.textBaseline = "alphabetic"
    }
    texture.needsUpdate = true
  }

  function refresh() {
    if (disposed) return
    const nearby = new Set([index, wrap(index + 1), wrap(index - 1)])
    for (const [key, image] of images) {
      if (nearby.has(key)) continue
      image.onload = image.onerror = null
      image.removeAttribute("src")
      images.delete(key)
    }
    for (const key of nearby) {
      if (images.has(key)) continue
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.decoding = "async"
      image.onload = image.onerror = () => { if (index === key) paint() }
      images.set(key, image)
      image.src = slider.images[key].url
    }
    paint()
  }

  mesh.onBeforeRender = () => {
    if (started) return
    started = true
    refresh()
  }
  mesh.userData.sliderControl = (uv: THREE.Vector2, direction?: number) => {
    if (disposed || count < 2) return
    const arrow = uv.y > 0.38 && uv.y < 0.62 ? (uv.x <= 0.24 ? -1 : uv.x >= 0.76 ? 1 : 0) : 0
    const step = direction ?? arrow
    if (!step) return
    index = wrap(index + step)
    refresh()
  }
  paint()

  return {
    mesh,
    dispose() {
      if (disposed) return
      disposed = true
      for (const image of images.values()) {
        image.onload = image.onerror = null
        image.removeAttribute("src")
      }
      images.clear()
      mesh.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.dispose()
      texture.dispose()
    },
  }
}
