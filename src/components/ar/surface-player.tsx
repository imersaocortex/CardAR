"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import type { ArExperienceData, ArState } from "@/lib/mindar"
import { buildSpatialScene, disposeSpatialGroup } from "@/lib/ar/spatial-scene"
import { Button } from "@/components/ui/button"
import { SpatialActions } from "./spatial-actions"
import { SurfaceFallbackPlayer } from "./surface-fallback-player"

interface Props {
  experience: ArExperienceData
  siteName: string
  hasWatermark: boolean
  onStateChange?: (state: ArState) => void
  onInteraction?: (event: string, metadata?: Record<string, unknown>) => void
}

export function SurfacePlayer({ experience, siteName, hasWatermark, onStateChange, onInteraction }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const stop = useRef<(() => void) | null>(null)
  const place = useRef<(() => void) | null>(null)
  const running = useRef(false)
  const alive = useRef(true)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [ready, setReady] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [soundError, setSoundError] = useState(false)
  const mediaControl = useRef<{ enableAudio: () => Promise<boolean>; muteAudio: () => void } | null>(null)
  const [message, setMessage] = useState("Verificando compatibilidade…")
  const [manualMode, setManualMode] = useState(false)
  const callbacks = useRef({ onStateChange, onInteraction })
  useEffect(() => { callbacks.current = { onStateChange, onInteraction } }, [onStateChange, onInteraction])

  useEffect(() => {
    alive.current = true
    Promise.resolve(navigator.xr?.isSessionSupported("immersive-ar") ?? false).then((ok) => {
      if (alive.current) { setSupported(ok); setMessage(ok ? "Posicione sua experiência no chão ou em uma mesa." : "Este navegador não oferece AR com detecção de superfícies.") }
    }).catch(() => { if (alive.current) setSupported(false) })
    return () => { alive.current = false; stop.current?.() }
  }, [])

  async function start() {
    if (running.current || !navigator.xr || !host.current || !overlay.current) return
    running.current = true
    setStarting(true)
    setMessage("Abrindo a câmera e carregando a cena…")
    let session: XRSession | undefined
    let renderer: THREE.WebGLRenderer | undefined
    let content: Awaited<ReturnType<typeof buildSpatialScene>> | undefined
    let hitSource: XRHitTestSource | undefined
    let worldAnchor: XRAnchor | undefined
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
    reticle.matrixAutoUpdate = false
    reticle.visible = false
    let ended = false
    const cleanup = () => {
      if (ended) return
      ended = true
      hitSource?.cancel()
      worldAnchor?.delete()
      renderer?.setAnimationLoop(null)
      content?.dispose()
      mediaControl.current = null
      disposeSpatialGroup(reticle)
      renderer?.dispose()
      renderer?.domElement.remove()
      running.current = false
      place.current = null
      if (alive.current) { setActive(false); setStarting(false); setReady(false); setPlaced(false); setSoundOn(false); setSoundError(false); setMessage("Experiência encerrada. Você pode iniciar novamente.") }
    }
    stop.current = () => { void session?.end().catch(() => {}); cleanup() }
    try {
      // Request the session directly from the user's click to preserve user activation.
      session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay", "anchors"], domOverlay: { root: overlay.current },
      })
      if (!alive.current || ended) { await session.end(); cleanup(); return }
      session.addEventListener("end", cleanup, { once: true })
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.xr.enabled = true
      renderer.xr.setReferenceSpaceType("local")
      host.current!.appendChild(renderer.domElement)
      await renderer.xr.setSession(session)
      if (ended) return
      const space = await session.requestReferenceSpace("viewer")
      if (ended) return
      hitSource = await session.requestHitTestSource!({ space }) ?? undefined
      if (ended) { hitSource?.cancel(); return }
      const loaded = await buildSpatialScene(experience.scene?.objects ?? [])
      if (ended || !alive.current) { loaded.dispose(); return }
      content = loaded
      mediaControl.current = loaded
      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 3), reticle, content.root)
      content.root.visible = false
      const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100)
      let placed = false
      let placementRequested = false
      place.current = () => {
        if (reticle.visible && !placed) placementRequested = true
      }
      session.addEventListener("select", () => { if (!placed) place.current?.() })
      const clock = new THREE.Clock()
      const viewerPosition = new THREE.Vector3()
      let previousReady = false
      renderer.setAnimationLoop((_time, frame) => {
        if (ended || !renderer || !content) return
        const delta = clock.getDelta()
        const reference = renderer.xr.getReferenceSpace()
        const hit = frame && hitSource ? frame.getHitTestResults(hitSource)[0] : undefined
        const pose = hit && reference ? hit.getPose(reference) : undefined
        reticle.visible = !!pose && !placed
        if (pose) {
          reticle.matrix.fromArray(pose.transform.matrix)
          if (reticle.matrix.elements[5] < 0.9) reticle.visible = false
        }
        if (placementRequested && reticle.visible && pose) {
          placementRequested = false
          content.root.position.setFromMatrixPosition(reticle.matrix)
          content.root.visible = true
          placed = true
          setPlaced(true)
          void content.play()
          if (hit?.createAnchor) void hit.createAnchor().then((anchor) => {
            if (ended || !placed) { anchor.delete(); return }
            worldAnchor?.delete()
            worldAnchor = anchor
          }).catch(() => {})
          setMessage("Cena posicionada. Toque em Reposicionar para escolher outra superfície.")
          callbacks.current.onStateChange?.("detected")
          callbacks.current.onInteraction?.("click", { action: "surface_placed" })
        }
        if (worldAnchor && reference && placed) {
          const anchoredPose = frame?.getPose(worldAnchor.anchorSpace, reference)
          if (anchoredPose) content.root.position.set(anchoredPose.transform.position.x, anchoredPose.transform.position.y, anchoredPose.transform.position.z)
        }
        if (reticle.visible !== previousReady) { previousReady = reticle.visible; setReady(previousReady) }
        const viewerPose = reference && frame?.getViewerPose(reference)
        if (viewerPose) {
          const { x, y, z } = viewerPose.transform.position
          viewerPosition.set(x, y, z)
        }
        content.update(delta, clock.elapsedTime, viewerPose ? viewerPosition : undefined)
        renderer.render(scene, camera)
      })
      const reposition = () => { worldAnchor?.delete(); worldAnchor = undefined; placed = false; placementRequested = false; setPlaced(false); content!.root.visible = false; setMessage("Mova a câmera lentamente até encontrar o chão ou uma mesa.") }
      repositionRef.current = reposition
      setActive(true)
      setStarting(false)
      setMessage("Mova a câmera lentamente. Toque no círculo para posicionar a cena.")
      callbacks.current.onStateChange?.("scanning")
    } catch (error) {
      stop.current?.()
      if (alive.current) { setMessage(error instanceof Error ? `Não foi possível iniciar: ${error.message}` : "Não foi possível iniciar a experiência."); setManualMode(true) }
      callbacks.current.onStateChange?.("error")
    }
  }
  async function toggleSound() {
    if (!mediaControl.current) return
    if (soundOn) { mediaControl.current.muteAudio(); setSoundOn(false); return }
    const enabled = await mediaControl.current.enableAudio()
    if (!alive.current) return
    setSoundOn(enabled)
    setSoundError(!enabled)
  }
  const repositionRef = useRef<(() => void) | null>(null)
  const hasMedia = experience.scene?.objects?.some((object) => object.visible && (object.type === "audio" || object.type.startsWith("video-")))
  if (manualMode || supported === false) return <SurfaceFallbackPlayer experience={experience} siteName={siteName} hasWatermark={hasWatermark} onStateChange={onStateChange} onInteraction={onInteraction} />
  return <div className="fixed inset-0 bg-slate-950 text-white">
    <div ref={host} className="absolute inset-0" />
    <div ref={overlay} className="absolute inset-0 pointer-events-none flex flex-col justify-between p-5">
      <div className="max-w-md rounded-2xl bg-black/65 p-4 backdrop-blur"><h1 className="font-semibold">{experience.name}</h1><p className="text-sm text-white/80" role="status">{message}</p></div>
      <div className="pointer-events-auto mx-auto flex max-w-md flex-wrap justify-center gap-3 rounded-2xl bg-black/65 p-4">
        {!active && <Button onClick={start} disabled={!supported || starting}>{starting ? "Carregando…" : "Iniciar AR na superfície"}</Button>}
        {active && <><Button onClick={() => place.current?.()} disabled={!ready}>Posicionar aqui</Button><Button variant="outline" onClick={() => repositionRef.current?.()}>Reposicionar</Button><Button variant="outline" onClick={() => stop.current?.()}>Encerrar</Button></>}
        {placed && <><SpatialActions objects={experience.scene?.objects ?? []} onInteraction={onInteraction} />{hasMedia && <Button variant="outline" onClick={toggleSound}>{soundOn ? "Silenciar" : "Ativar som"}</Button>}{soundError && <p className="w-full text-center text-xs">O som foi bloqueado. Toque novamente.</p>}</>}
        {hasWatermark && siteName && <span className="w-full text-center text-xs text-white/60">{siteName}</span>}
      </div>
    </div>
  </div>
}
