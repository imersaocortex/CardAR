"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { StereoEffect } from "three/addons/effects/StereoEffect.js"
import { buildSpatialScene } from "@/lib/ar/spatial-scene"
import { bearingDifference, geoOffset, gpsDisplayPosition, isGpsWithinRadius } from "@/lib/ar/geo"
import type { ArExperienceData, ArState } from "@/lib/mindar"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { ArActions } from "./ar-actions"
import { SpatialActions } from "./spatial-actions"

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
type OrientationAPI = typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> }

export function GpsPlayer({ experience, experiences, siteName, hasWatermark, onStateChange, onInteraction, cardboard = false }: {
  experience: ArExperienceData; experiences?: ArExperienceData[]; siteName: string; hasWatermark: boolean; onStateChange?: (state: ArState) => void
  onInteraction?: (event: string, metadata?: Record<string, unknown>) => void
  cardboard?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stereoVideo = useRef<HTMLVideoElement>(null)
  const cardboardRef = useRef(cardboard)
  useEffect(() => { cardboardRef.current = cardboard }, [cardboard])
  const stop = useRef<(() => void) | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
  const callback = useRef(onStateChange)
  useEffect(() => { callback.current = onStateChange }, [onStateChange])
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)
  const [visibleProjectIndices, setVisibleProjectIndices] = useState<number[]>([])
  const [soundOn, setSoundOn] = useState(false)
  const soundOnRef = useRef(false)
  const [soundError, setSoundError] = useState(false)
  const [heading, setHeading] = useState<number | null>(null)
  const mediaControl = useRef<{ enableAudio: () => Promise<boolean>; muteAudio: () => void } | null>(null)
  const [status, setStatus] = useState("A experiência aparecerá na direção do ponto geográfico. Permita câmera, localização e orientação.")
  const [location, setLocation] = useState<{ distance: number; accuracy: number; bearing: number; atTarget: boolean; radius: number } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current?.() } }, [])

  async function start() {
    if (busy.current) return
    busy.current = true
    setActive(true)
    let ended = false
    let stream: MediaStream | undefined
    let renderer: THREE.WebGLRenderer | undefined
    const projects = experiences?.length ? experiences : [experience]
    const contents: Awaited<ReturnType<typeof buildSpatialScene>>[] = []
    const inRange = projects.map(() => false)
    const visibleByIndex = projects.map(() => false)
    let watch: number | undefined
    const listeners: (() => void)[] = []
    stop.current = () => {
      if (ended) return
      ended = true
      if (watch !== undefined) navigator.geolocation.clearWatch(watch)
      listeners.forEach((remove) => remove())
      stream?.getTracks().forEach((track) => track.stop())
      if (video.current) video.current.srcObject = null
      if (stereoVideo.current) stereoVideo.current.srcObject = null
      renderer?.setAnimationLoop(null); contents.forEach((content) => content.dispose()); renderer?.dispose(); renderer?.domElement.remove()
      mediaControl.current = null
      busy.current = false
      soundOnRef.current = false
      if (alive.current) { setActive(false); setReady(false); setVisible(false); setVisibleProjectIndices([]); setSoundOn(false); setSoundError(false); setLocation(null); setHeading(null); setStatus("Experiência encerrada. Toque para iniciar novamente.") }
    }
    try {
      if (projects.some((project) => project.latitude == null || project.longitude == null)) throw new Error("As coordenadas não foram configuradas.")
      if (!navigator.geolocation || !navigator.mediaDevices?.getUserMedia || !window.DeviceOrientationEvent) throw new Error("Use um celular com câmera, GPS e bússola em uma conexão HTTPS.")
      const orientationAPI = DeviceOrientationEvent as OrientationAPI
      if (orientationAPI.requestPermission && await orientationAPI.requestPermission(true) !== "granted") throw new Error("Permita o acesso à orientação para localizar a experiência.")
      if (ended) return
      setStatus("Carregando a cena e aguardando GPS e bússola…")
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      if (ended || !alive.current) { stream.getTracks().forEach((track) => track.stop()); return }
      video.current!.srcObject = stream
      stereoVideo.current!.srcObject = stream
      await video.current!.play()
      void stereoVideo.current!.play().catch(() => {})
      for (const project of projects) {
        const loaded = await buildSpatialScene(project.scene?.objects ?? [], { autoplayHls: false })
        contents.push(loaded)
      }
      if (ended || !alive.current) return
      if (!projects.some((project) => project.scene?.objects?.some((object) => object.visible && (object.assetUrl || object.type.startsWith("botao-"))))) {
        throw new Error("Esta cena ainda não tem um objeto visível. Adicione um modelo, imagem ou vídeo no editor.")
      }
      mediaControl.current = {
        enableAudio: async () => (await Promise.all(contents.map((content, index) => visibleByIndex[index] ? content.enableAudio() : Promise.resolve(false)))).some(Boolean),
        muteAudio: () => contents.forEach((content) => content.muteAudio()),
      }
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      host.current!.appendChild(renderer.domElement)
      const stereoEffect = new StereoEffect(renderer)
      const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 10000)
      const scene = new THREE.Scene()
      const anchors = contents.map((content) => {
        const anchor = new THREE.Group()
        anchor.add(content.root)
        anchor.visible = false
        scene.add(anchor)
        return anchor
      })
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 3))
      const resize = () => { renderer!.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }
      resize(); window.addEventListener("resize", resize); listeners.push(() => window.removeEventListener("resize", resize))
      let compassAt = 0, positionAt = 0, atTarget = false, wasVisible = false, nearestRadius = 100
      const lastReliableBearings: (number | null)[] = projects.map(() => null)
      const desiredPositions = projects.map(() => new THREE.Vector3())
      let compassAccuracy: number | null = null
      const euler = new THREE.Euler()
      const correction = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
      const screenCorrection = new THREE.Quaternion()
      const zAxis = new THREE.Vector3(0, 0, 1)
      const orientation = (event: DeviceOrientationEvent) => {
        const compass = event as CompassEvent
        if (event.beta == null || event.gamma == null) return
        const hasHeading = Number.isFinite(compass.webkitCompassHeading)
        if (!hasHeading && (!event.absolute || event.alpha == null)) return
        compassAccuracy = hasHeading && compass.webkitCompassAccuracy != null && compass.webkitCompassAccuracy >= 0 ? compass.webkitCompassAccuracy : null
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
        const firstFix = positionAt === 0
        positionAt = Date.now()
        type NearbyPoint = { distance: number; bearing: number; atTarget: boolean; radius: number }
        let nearest: NearbyPoint | null = null
        let nearestInRange: NearbyPoint | null = null
        for (const [index, project] of projects.entries()) {
          const offset = geoOffset(coords.latitude, coords.longitude, project.latitude!, project.longitude!)
          const placement = gpsDisplayPosition(offset, coords.accuracy, lastReliableBearings[index])
          const radius = project.activationRadius ?? 100
          const nearby = isGpsWithinRadius(offset.distance, radius)
          inRange[index] = nearby
          if (!placement.atTarget) lastReliableBearings[index] = offset.bearing
          desiredPositions[index].set(placement.east, 0, -placement.north)
          if (firstFix) anchors[index].position.copy(desiredPositions[index])
          const point = { distance: offset.distance, bearing: offset.bearing, atTarget: placement.atTarget, radius }
          if (!nearest || point.distance < nearest.distance) nearest = point
          if (nearby && (!nearestInRange || point.distance < nearestInRange.distance)) nearestInRange = point
        }
        const currentPoint: NearbyPoint | null = nearestInRange ?? nearest
        if (currentPoint) { atTarget = currentPoint.atTarget; nearestRadius = currentPoint.radius; setLocation({ ...currentPoint, accuracy: coords.accuracy }) }
      }, (error) => {
        positionAt = 0
        setStatus(error.code === 1 ? "Localização bloqueada. Permita o acesso nas configurações do navegador e tente novamente." : "GPS indisponível. Procure um local aberto.")
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 })
      const clock = new THREE.Clock()
      let lastStatus = ""
      let lastHeadingAt = 0
      const forward = new THREE.Vector3()
      renderer.setAnimationLoop(() => {
        if (ended || !renderer) return
        const now = Date.now()
        const compassOk = now - compassAt < 10000
        const positionOk = now - positionAt < 30000
        const visibleIndices: number[] = []
        let visibilityChanged = false
        anchors.forEach((anchor, index) => {
          const shouldShow = compassOk && positionOk && inRange[index]
          anchor.visible = shouldShow
          if (shouldShow) visibleIndices.push(index)
          if (shouldShow === visibleByIndex[index]) return
          visibleByIndex[index] = shouldShow
          visibilityChanged = true
          if (shouldShow) {
            anchor.position.copy(desiredPositions[index])
            const projectHasMedia = projects[index].scene?.objects?.some((object) => object.visible && (object.type === "audio" || object.type.startsWith("video-")))
            if (soundOnRef.current && projectHasMedia) {
              void contents[index].enableAudio().then((enabled) => {
                if (!enabled && !ended && alive.current && visibleByIndex[index]) { setSoundError(true); void contents[index].play() }
              })
            } else {
              void contents[index].play()
            }
          } else {
            contents[index].muteAudio()
            contents[index].pause()
          }
        })
        if (visibilityChanged) setVisibleProjectIndices(visibleIndices)
        if (visibilityChanged && visibleIndices.length === 0) setSoundError(false)
        if (visibleIndices.length === 0 && soundOnRef.current) { soundOnRef.current = false; setSoundOn(false) }
        const delta = clock.getDelta()
        if (positionOk) anchors.forEach((anchor, index) => anchor.position.lerp(desiredPositions[index], 1 - Math.exp(-delta * 4)))
        if (compassOk && positionOk) {
          camera.getWorldDirection(forward)
          forward.y = 0
          if (forward.lengthSq() > 0.001) {
            forward.normalize()
            if (now - lastHeadingAt > 250) {
              setHeading((Math.atan2(forward.x, -forward.z) * 180 / Math.PI + 360) % 360)
              lastHeadingAt = now
            }
          }
        }
        const message = !compassOk ? "Aguardando bússola · mova o celular" : !positionOk ? "Buscando GPS…" : visibleIndices.length === 0 ? `Aproxime-se até ${nearestRadius} m do ponto` : compassAccuracy !== null && compassAccuracy > 50 ? "Bússola imprecisa · afaste-se de metal" : atTarget ? "Próximo ao ponto" : "Siga a direção do objeto"
        if (message !== lastStatus) { lastStatus = message; setStatus(message) }
        if ((visibleIndices.length > 0) !== wasVisible) {
          wasVisible = visibleIndices.length > 0
          setVisible(wasVisible)
          callback.current?.(wasVisible ? "detected" : "lost")
        }
        contents.forEach((content) => content.update(delta, clock.elapsedTime, camera.position))
        if (cardboardRef.current) stereoEffect.render(scene, camera)
        else { renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.render(scene, camera) }
      })
      setReady(true)
      callback.current?.("scanning")
    } catch (error) {
      stop.current?.()
      if (alive.current) setStatus(error instanceof Error ? error.message : "Não foi possível iniciar a experiência.")
      callback.current?.("error")
    }
  }

  async function toggleSound() {
    if (!mediaControl.current) return
    if (soundOn) { mediaControl.current.muteAudio(); soundOnRef.current = false; setSoundOn(false); return }
    const enabled = await mediaControl.current.enableAudio()
    if (!alive.current) return
    soundOnRef.current = enabled
    setSoundOn(enabled)
    setSoundError(!enabled)
  }

  const turn = location && heading !== null && !location.atTarget ? bearingDifference(location.bearing, heading) : null
  const projectsForDisplay = experiences?.length ? experiences : [experience]
  const hasMedia = visibleProjectIndices.some((index) => projectsForDisplay[index]?.scene?.objects?.some((object) => object.visible && (object.type === "audio" || object.type.startsWith("video-"))))

  return <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white">
    <video ref={video} autoPlay muted playsInline className={`absolute inset-y-0 left-0 h-full object-cover ${cardboard ? "w-1/2" : "w-full"}`} />
    <video ref={stereoVideo} autoPlay muted playsInline aria-hidden="true" className={`absolute inset-y-0 right-0 h-full w-1/2 object-cover ${cardboard ? "block" : "hidden"}`} />
    <div ref={host} className="absolute inset-0" />
    {!cardboard && <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-4">
      <span className="max-w-[55%] truncate text-[11px] font-medium text-white/70 drop-shadow-md">{experience.name}</span>
      {active && <button type="button" onClick={() => stop.current?.()} aria-label="Encerrar experiência" className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/80 backdrop-blur-sm"><X className="h-4 w-4" /></button>}
    </div>}
    {!cardboard && active && location && <div className="pointer-events-none absolute right-4 top-14 z-20 text-right font-mono text-[10px] leading-relaxed text-white/70 drop-shadow-md">
      <p>{Math.round(location.distance)} m até o ponto</p>
      <p>GPS ±{Math.round(location.accuracy)} m · raio {location.radius} m</p>
    </div>}
    {!active && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <Button onClick={start}>Iniciar experiência GPS</Button>
      <p className="max-w-xs text-xs text-white/75" role="status">{status}</p>
    </div>}
    {!cardboard && active && <div className="pointer-events-none absolute left-4 top-12 z-20 max-w-[50%] text-[10px] leading-snug text-white/75 drop-shadow-md" role="status">
      {ready && visible && location ? (location.atTarget ? "Próximo ao ponto" : turn !== null && Math.abs(turn) < 15 ? "Objeto à frente" : turn !== null ? <span>Gire {Math.round(Math.abs(turn))}° para {turn > 0 ? "a direita" : "a esquerda"} <span className="inline-block" style={{ transform: `rotate(${turn}deg)` }} aria-hidden="true">↑</span></span> : status) : status}
    </div>}
    {cardboard && active && <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex text-center text-[10px] text-white/70 drop-shadow-md" role="status">{[0, 1].map((eye) => <span key={eye} className="w-1/2 px-2">{location ? `${Math.round(location.distance)} m · ${status}` : status}</span>)}</div>}
    {hasWatermark && siteName && <div className={`pointer-events-none absolute bottom-20 left-0 right-0 z-10 flex ${cardboard ? "justify-around" : "justify-center"}`}>{(cardboard ? [0, 1] : [0]).map((eye) => <span key={eye} className="rounded-full bg-black/30 px-3 py-1 text-[10px] text-white/50">{siteName}</span>)}</div>}
    {ready && <>
      {!cardboard && visible && <div className="absolute bottom-28 left-0 right-0 z-20 flex flex-wrap justify-center gap-2 px-4"><SpatialActions objects={visibleProjectIndices.flatMap((index) => projectsForDisplay[index]?.scene?.objects ?? [])} onInteraction={onInteraction} />{hasMedia && <Button size="sm" variant="outline" onClick={toggleSound}>{soundOn ? "Silenciar" : "Ativar som"}</Button>}{soundError && <p className="w-full text-center text-[11px] text-white/80">O som foi bloqueado. Toque em Ativar som novamente.</p>}</div>}
      {!cardboard && <div className="absolute bottom-6 left-0 right-0 z-20"><ArActions videoRef={video} containerRef={host} reuseCameraForQr /></div>}
    </>}
  </div>
}
