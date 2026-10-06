"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { Button } from "@/components/ui/button"
import { buildSpatialScene } from "@/lib/ar/spatial-scene"
import type { ArExperienceData, ArState } from "@/lib/mindar"
import { ArActions } from "./ar-actions"
import { SpatialActions } from "./spatial-actions"

type OrientationAPI = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }

export function SurfaceFallbackPlayer({ experience, siteName, hasWatermark, onStateChange, onInteraction }: {
  experience: ArExperienceData; siteName: string; hasWatermark: boolean
  onStateChange?: (state: ArState) => void
  onInteraction?: (event: string, metadata?: Record<string, unknown>) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stop = useRef<(() => void) | null>(null)
  const place = useRef<(height: number) => void>(() => {})
  const media = useRef<{ enableAudio: () => Promise<boolean>; muteAudio: () => void } | null>(null)
  const alive = useRef(true)
  const [active, setActive] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [height, setHeight] = useState<"table" | "floor">("table")
  const [status, setStatus] = useState("Neste aparelho, posicione a cena manualmente. A câmera acompanha a rotação, mas não detecta a superfície nem acompanha deslocamentos físicos.")
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current?.() } }, [])

  async function start() {
    if (active || !host.current || !video.current) return
    setActive(true)
    let ended = false
    let stream: MediaStream | undefined
    let renderer: THREE.WebGLRenderer | undefined
    let content: Awaited<ReturnType<typeof buildSpatialScene>> | undefined
    const listeners: (() => void)[] = []
    stop.current = () => {
      if (ended) return
      ended = true
      listeners.forEach((remove) => remove())
      stream?.getTracks().forEach((track) => track.stop())
      if (video.current) video.current.srcObject = null
      renderer?.setAnimationLoop(null)
      content?.dispose()
      renderer?.dispose()
      renderer?.domElement.remove()
      media.current = null
      if (alive.current) { setActive(false); setPlaced(false); setSoundOn(false); setStatus("Experiência encerrada. Toque para iniciar novamente.") }
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera indisponível neste navegador.")
      if (window.DeviceOrientationEvent) {
        const orientationAPI = DeviceOrientationEvent as OrientationAPI
        if (orientationAPI.requestPermission && await orientationAPI.requestPermission() !== "granted")
          setStatus("Orientação negada: a cena pode não acompanhar a rotação do celular.")
      }
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      if (ended || !alive.current) { stream.getTracks().forEach((track) => track.stop()); return }
      video.current.srcObject = stream
      await video.current.play()
      content = await buildSpatialScene(experience.scene?.objects ?? [])
      if (ended || !alive.current) return
      media.current = content
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      host.current.appendChild(renderer.domElement)
      const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 100)
      camera.position.set(0, 1.5, 0)
      const scene = new THREE.Scene()
      scene.add(content.root, new THREE.HemisphereLight(0xffffff, 0x667788, 3))
      content.root.visible = false
      const resize = () => { renderer!.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }
      resize(); window.addEventListener("resize", resize); listeners.push(() => window.removeEventListener("resize", resize))
      const euler = new THREE.Euler()
      const correction = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
      const screenCorrection = new THREE.Quaternion()
      const zAxis = new THREE.Vector3(0, 0, 1)
      const orient = (event: DeviceOrientationEvent) => {
        if (event.alpha == null || event.beta == null || event.gamma == null) return
        euler.set(THREE.MathUtils.degToRad(event.beta), THREE.MathUtils.degToRad(event.alpha), -THREE.MathUtils.degToRad(event.gamma), "YXZ")
        camera.quaternion.setFromEuler(euler).multiply(correction).multiply(screenCorrection.setFromAxisAngle(zAxis, -THREE.MathUtils.degToRad(screen.orientation?.angle ?? 0)))
      }
      window.addEventListener("deviceorientationabsolute", orient)
      window.addEventListener("deviceorientation", orient)
      listeners.push(() => { window.removeEventListener("deviceorientationabsolute", orient); window.removeEventListener("deviceorientation", orient) })
      const forward = new THREE.Vector3()
      place.current = (targetHeight: number) => {
        if (!content) return
        camera.getWorldDirection(forward)
        content.root.position.copy(camera.position).addScaledVector(forward, 2.2)
        content.root.position.y = targetHeight
        content.root.visible = true
        setPlaced(true)
        void content.play()
        onStateChange?.("detected")
        onInteraction?.("click", { action: "manual_surface_placed" })
      }
      const clock = new THREE.Clock()
      renderer.setAnimationLoop(() => {
        if (ended || !renderer || !content) return
        content.update(clock.getDelta(), clock.elapsedTime, camera.position)
        renderer.render(scene, camera)
      })
      setStatus("Escolha chão ou mesa e toque em Posicionar. O movimento físico do celular não é rastreado neste modo.")
      onStateChange?.("scanning")
    } catch (error) {
      stop.current?.()
      if (alive.current) setStatus(error instanceof Error ? error.message : "Não foi possível iniciar a câmera.")
      onStateChange?.("error")
    }
  }
  const hasMedia = experience.scene?.objects?.some((object) => object.visible && (object.type === "audio" || object.type.startsWith("video-")))
  const toggleSound = async () => {
    if (!media.current) return
    if (soundOn) { media.current.muteAudio(); setSoundOn(false) }
    else setSoundOn(await media.current.enableAudio())
  }
  return <div className="fixed inset-0 overflow-hidden bg-slate-950 text-white">
    <video ref={video} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
    <div ref={host} className="absolute inset-0" />
    <div className="absolute inset-x-4 top-4 z-20 rounded-xl bg-black/55 p-3 text-center backdrop-blur-sm">
      <p className="text-sm font-medium">{experience.name} · posicionamento manual</p>
      <p className="mt-1 text-xs text-white/75" role="status">{status}</p>
    </div>
    {!active && <div className="absolute inset-0 z-10 flex items-center justify-center"><Button onClick={start}>Abrir câmera</Button></div>}
    {active && <div className="absolute inset-x-4 bottom-24 z-20 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-black/55 p-3 backdrop-blur-sm">
      <label className="text-xs">Altura <select value={height} onChange={(event) => setHeight(event.target.value as "table" | "floor")} className="ml-1 rounded bg-slate-900 p-2"><option value="table">Mesa</option><option value="floor">Chão</option></select></label>
      <Button size="sm" onClick={() => place.current(height === "floor" ? 0 : 0.8)}>{placed ? "Reposicionar" : "Posicionar"}</Button>
      <Button size="sm" variant="outline" onClick={() => stop.current?.()}>Encerrar</Button>
      {placed && <SpatialActions objects={experience.scene?.objects ?? []} onInteraction={onInteraction} />}
      {placed && hasMedia && <Button size="sm" variant="outline" onClick={toggleSound}>{soundOn ? "Silenciar" : "Ativar som"}</Button>}
    </div>}
    {hasWatermark && siteName && <span className="pointer-events-none absolute bottom-20 left-0 right-0 z-10 text-center text-[10px] text-white/50">{siteName}</span>}
    {active && <div className="absolute bottom-5 left-0 right-0 z-20"><ArActions videoRef={video} containerRef={host} reuseCameraForQr /></div>}
  </div>
}
