"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { buildSpatialScene } from "@/lib/ar/spatial-scene"
import { geoOffset } from "@/lib/ar/geo"
import type { ArExperienceData, ArState } from "@/lib/mindar"
import { Button } from "@/components/ui/button"
import { SpatialActions } from "./spatial-actions"

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
type OrientationAPI = typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> }

export function GpsPlayer({ experience, siteName, hasWatermark, onStateChange, onInteraction }: {
  experience: ArExperienceData; siteName: string; hasWatermark: boolean; onStateChange?: (state: ArState) => void
  onInteraction?: (event: string, metadata?: Record<string, unknown>) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stop = useRef<(() => void) | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
  const callback = useRef(onStateChange)
  useEffect(() => { callback.current = onStateChange }, [onStateChange])
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(false)
  const playMedia = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState("A experiência aparecerá na direção do ponto geográfico. Permita câmera, localização e orientação.")
  const [location, setLocation] = useState<{ distance: number; accuracy: number; bearing: number } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current?.() } }, [])

  async function start() {
    if (busy.current) return
    busy.current = true
    setActive(true)
    let ended = false
    let stream: MediaStream | undefined
    let renderer: THREE.WebGLRenderer | undefined
    let content: Awaited<ReturnType<typeof buildSpatialScene>> | undefined
    let watch: number | undefined
    const listeners: (() => void)[] = []
    stop.current = () => {
      if (ended) return
      ended = true
      if (watch !== undefined) navigator.geolocation.clearWatch(watch)
      listeners.forEach((remove) => remove())
      stream?.getTracks().forEach((track) => track.stop())
      if (video.current) video.current.srcObject = null
      renderer?.setAnimationLoop(null); content?.dispose(); renderer?.dispose(); renderer?.domElement.remove()
      busy.current = false
      if (alive.current) { setActive(false); setVisible(false); setLocation(null) }
    }
    try {
      if (experience.latitude == null || experience.longitude == null) throw new Error("As coordenadas não foram configuradas.")
      if (!navigator.geolocation || !navigator.mediaDevices?.getUserMedia || !window.DeviceOrientationEvent) throw new Error("Use um celular com câmera, GPS e bússola em uma conexão HTTPS.")
      const orientationAPI = DeviceOrientationEvent as OrientationAPI
      if (orientationAPI.requestPermission && await orientationAPI.requestPermission(true) !== "granted") throw new Error("Permita o acesso à orientação para localizar a experiência.")
      if (ended) return
      setStatus("Carregando a cena e aguardando GPS e bússola…")
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      if (ended || !alive.current) { stream.getTracks().forEach((track) => track.stop()); return }
      video.current!.srcObject = stream
      await video.current!.play()
      const loaded = await buildSpatialScene(experience.scene?.objects ?? [])
      if (ended || !alive.current) { loaded.dispose(); return }
      content = loaded
      playMedia.current = () => { void loaded.play() }
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      host.current!.appendChild(renderer.domElement)
      const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 10000)
      const scene = new THREE.Scene()
      const anchor = new THREE.Group()
      anchor.add(content.root)
      anchor.visible = false
      scene.add(anchor, new THREE.HemisphereLight(0xffffff, 0x667788, 3))
      const resize = () => { renderer!.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }
      resize(); window.addEventListener("resize", resize); listeners.push(() => window.removeEventListener("resize", resize))
      let compassAt = 0, positionAt = 0, inRange = false, precise = false, wasVisible = false
      const euler = new THREE.Euler()
      const correction = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
      const screenCorrection = new THREE.Quaternion()
      const zAxis = new THREE.Vector3(0, 0, 1)
      const orientation = (event: DeviceOrientationEvent) => {
        const compass = event as CompassEvent
        if (event.beta == null || event.gamma == null) return
        const hasHeading = Number.isFinite(compass.webkitCompassHeading)
        if (!hasHeading && (!event.absolute || event.alpha == null)) return
        if (hasHeading && compass.webkitCompassAccuracy != null && (compass.webkitCompassAccuracy < 0 || compass.webkitCompassAccuracy > 50)) return
        const alpha = hasHeading ? 360 - compass.webkitCompassHeading! : event.alpha!
        euler.set(THREE.MathUtils.degToRad(event.beta), THREE.MathUtils.degToRad(alpha), -THREE.MathUtils.degToRad(event.gamma), "YXZ")
        camera.quaternion.setFromEuler(euler).multiply(correction).multiply(screenCorrection.setFromAxisAngle(zAxis, -THREE.MathUtils.degToRad(screen.orientation?.angle ?? 0)))
        compassAt = Date.now()
      }
      window.addEventListener("deviceorientationabsolute", orientation)
      window.addEventListener("deviceorientation", orientation)
      listeners.push(() => { window.removeEventListener("deviceorientationabsolute", orientation); window.removeEventListener("deviceorientation", orientation) })
      watch = navigator.geolocation.watchPosition(({ coords }) => {
        if (ended) return
        const offset = geoOffset(coords.latitude, coords.longitude, experience.latitude!, experience.longitude!)
        positionAt = Date.now()
        inRange = offset.distance <= (experience.activationRadius ?? 100)
        precise = coords.accuracy <= Math.min(50, (experience.activationRadius ?? 100) / 2)
        anchor.position.set(offset.east, -1.5, -offset.north)
        setLocation({ distance: offset.distance, bearing: offset.bearing, accuracy: coords.accuracy })
      }, (error) => {
        positionAt = 0
        setStatus(error.code === 1 ? "Localização bloqueada. Permita o acesso nas configurações do navegador e tente novamente." : "GPS indisponível. Procure um local aberto.")
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 })
      const clock = new THREE.Clock()
      let lastStatus = ""
      renderer.setAnimationLoop(() => {
        if (ended || !content || !renderer) return
        const now = Date.now()
        const compassOk = now - compassAt < 10000
        const positionOk = now - positionAt < 30000
        anchor.visible = compassOk && positionOk && precise && inRange
        const message = !compassOk ? "Aguardando bússola. Movimente o celular para calibrar a orientação." : !positionOk ? "Aguardando localização GPS atualizada…" : !precise ? "Precisão GPS insuficiente. Procure uma área aberta." : !inRange ? "Aproxime-se do ponto para ativar a experiência." : "Aponte o celular na direção indicada. O posicionamento por GPS é aproximado."
        if (message !== lastStatus) { lastStatus = message; setStatus(message) }
        if (anchor.visible !== wasVisible) {
          wasVisible = anchor.visible
          setVisible(wasVisible)
          callback.current?.(wasVisible ? "detected" : "lost")
          if (wasVisible) void content.play()
        }
        const delta = clock.getDelta()
        content.update(delta, clock.elapsedTime)
        renderer.render(scene, camera)
      })
      callback.current?.("scanning")
    } catch (error) {
      stop.current?.()
      if (alive.current) setStatus(error instanceof Error ? error.message : "Não foi possível iniciar a experiência.")
      callback.current?.("error")
    }
  }

  return <div className="fixed inset-0 bg-slate-950 text-white">
    <video ref={video} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
    <div ref={host} className="absolute inset-0" />
    <div className="absolute inset-x-4 top-4 mx-auto max-w-md rounded-2xl bg-black/70 p-4 backdrop-blur">
      <h1 className="font-semibold">{experience.name}</h1><p className="mt-2 text-sm" role="status">{status}</p>
      {location && <p className="mt-3 font-mono text-xs text-cyan-300">{Math.round(location.distance)} m até o ponto · direção {Math.round(location.bearing)}° · GPS ±{Math.round(location.accuracy)} m</p>}
    </div>
    <div className="absolute inset-x-4 bottom-6 flex flex-col items-center gap-3">
      <Button onClick={active ? () => stop.current?.() : start}>{active ? "Encerrar experiência" : "Iniciar experiência GPS"}</Button>
      {visible && <div className="flex flex-wrap justify-center gap-2"><SpatialActions objects={experience.scene?.objects ?? []} onInteraction={onInteraction} /><Button variant="outline" onClick={() => playMedia.current?.()}>Reproduzir mídia</Button></div>}
      {hasWatermark && siteName && <span className="rounded-full bg-black/60 px-4 py-1 text-xs">{siteName}</span>}
    </div>
  </div>
}
