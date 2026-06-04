"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import * as THREE from "three"
import type { ArExperienceData, ArState } from "@/lib/mindar"
import { ArActions } from "./ar-actions"
import { CameraPermissionDenied, NoCamera, WebGLUnavailable, MarkerNotFound } from "./ar-fallbacks"

interface ArPlayerProps {
  experience: ArExperienceData
  onStateChange?: (state: ArState) => void
}

export function ArPlayer({ experience, onStateChange }: ArPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const anchorGroupRef = useRef<THREE.Group>(new THREE.Group())
  const animFrameRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const startingRef = useRef(false)
  const anchorBuiltRef = useRef(false)
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2())
  const arStateRef = useRef<ArState>("loading")
  const detectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [arState, setArState] = useState<ArState>("loading")
  const [fallback, setFallback] = useState<"camera-permission" | "no-camera" | "webgl" | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [initKey, setInitKey] = useState(0)
  const [noDetectionWarning, setNoDetectionWarning] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [initStep, setInitStep] = useState("")

  const step = useCallback((msg: string) => {
    console.log("[AR]", msg)
    setInitStep(msg)
  }, [])

  const updateState = useCallback(
    (state: ArState) => {
      arStateRef.current = state
      setArState(state)
      onStateChange?.(state)
    },
    [onStateChange],
  )

  const checkWebGL = useCallback((): boolean => {
    try {
      const canvas = document.createElement("canvas")
      return !!(canvas.getContext("webgl") || canvas.getContext("webgl2"))
    } catch {
      return false
    }
  }, [])

  const handleAction = useCallback((action: string) => {
    let actionType = ""
    let actionValue = ""

    if (action.includes(":")) {
      const colonIndex = action.indexOf(":")
      actionType = action.substring(0, colonIndex)
      actionValue = action.substring(colonIndex + 1)
    } else if (action.startsWith("http")) {
      actionType = "url"
      actionValue = action
    } else if (action.startsWith("tel:")) {
      actionType = "phone"
      actionValue = action.replace("tel:", "")
    } else if (action.startsWith("mailto:")) {
      actionType = "email"
      actionValue = action.replace("mailto:", "")
    } else {
      actionType = "url"
      actionValue = action
    }

    switch (actionType) {
      case "url":
      case "link":
        window.open(actionValue, "_blank", "noopener,noreferrer")
        break
      case "whatsapp": {
        const phone = actionValue.replace(/\D/g, "")
        window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer")
        break
      }
      case "instagram": {
        const insta = actionValue.replace("@", "")
        window.open(`https://instagram.com/${insta}`, "_blank", "noopener,noreferrer")
        break
      }
      case "phone":
        window.location.href = `tel:${actionValue}`
        break
      case "email":
        window.location.href = `mailto:${actionValue}`
        break
      default:
        window.open(actionValue, "_blank", "noopener,noreferrer")
    }
  }, [])

  const buildSceneObjects = useCallback(async (anchorGroup: THREE.Group) => {
    if (!experience.scene?.objects || anchorBuiltRef.current) return
    anchorBuiltRef.current = true

    for (const obj of experience.scene.objects) {
      const isModel = obj.type === "modelo-3d" || obj.type === "modelo-3d-animado"
      const isVideo = obj.type === "video-mp4" || obj.type === "video-chromakey"
      const isImage = obj.type === "imagem"
      const isAudio = obj.type === "audio"
      const isButton = obj.type.startsWith("botao-")

      if (isModel) {
        const group = new THREE.Group()
        group.position.set(obj.position[0], obj.position[1], obj.position[2])
        group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
        group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

        const placeholder = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.1, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x8b5cf6, transparent: true, opacity: obj.opacity }),
        )
        placeholder.userData.animationType = obj.animationType
        placeholder.userData.assetUrl = obj.assetUrl
        group.add(placeholder)
        anchorGroup.add(group)

        if (obj.assetUrl) {
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
          const loader = new GLTFLoader()
          loader.load(
            obj.assetUrl,
            (gltf: any) => {
              const model = gltf.scene
              model.position.copy(placeholder.position)
              model.scale.copy(placeholder.scale)
              model.rotation.copy(placeholder.rotation)
              group.remove(placeholder)
              group.add(model)
              if (gltf.animations?.length && obj.animationType !== "none") {
                const mixer = new THREE.AnimationMixer(model)
                const action = mixer.clipAction(gltf.animations[0])
                action.play()
                ;(group as any)._mixer = mixer
              }
            },
            undefined,
            () => {},
          )
        }
      }

      if (isVideo) {
        const group = new THREE.Group()
        group.position.set(obj.position[0], obj.position[1], obj.position[2])
        group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
        group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

        const meshMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.5 })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), meshMat)
        mesh.userData.isVideo = true
        mesh.userData.objectId = obj.id
        mesh.userData.assetUrl = obj.assetUrl
        mesh.userData.chromaKeyColor = obj.chromaKeyColor
        mesh.userData.chromaKeyTolerance = obj.chromaKeyTolerance ?? 0.4
        mesh.userData.chromaKeySmoothness = obj.chromaKeySmoothness ?? 0.1
        group.add(mesh)
        anchorGroup.add(group)

        if (obj.assetUrl) {
          const v = document.createElement("video")
          v.crossOrigin = "anonymous"
          v.loop = true
          v.muted = true
          v.playsInline = true
          v.autoplay = true
          v.preload = "auto"
          v.src = obj.assetUrl
          v.load()

          v.addEventListener("canplay", () => {
            const texture = new THREE.VideoTexture(v)
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter

            if (obj.type === "video-chromakey" && obj.chromaKeyColor) {
              const chromaColor = new THREE.Color(obj.chromaKeyColor)
              const tolerance = (obj.chromaKeyTolerance ?? 0.4) / 100
              const smoothness = (obj.chromaKeySmoothness ?? 0.1) / 100

              meshMat.dispose()
              ;(mesh as any).material = new THREE.ShaderMaterial({
                vertexShader: `
                  varying vec2 vUv;
                  void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                  }
                `,
                fragmentShader: `
                  uniform sampler2D uTexture;
                  uniform vec3 uChromaKey;
                  uniform float uTolerance;
                  uniform float uSmoothness;
                  varying vec2 vUv;
                  void main() {
                    vec4 color = texture2D(uTexture, vUv);
                    vec3 diff = abs(color.rgb - uChromaKey);
                    float dist = length(diff);
                    float alpha = smoothstep(uTolerance - uSmoothness, uTolerance + uSmoothness, dist);
                    gl_FragColor = vec4(color.rgb, alpha);
                  }
                `,
                uniforms: {
                  uTexture: { value: texture },
                  uChromaKey: { value: chromaColor },
                  uTolerance: { value: tolerance },
                  uSmoothness: { value: smoothness },
                },
                transparent: true,
                depthWrite: false,
              })
            } else {
              meshMat.dispose()
              ;(mesh as any).material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
              })
            }

            mesh.userData.videoTexture = texture
            mesh.userData.video = v
            v.play().catch(() => {})
          })
        }
      }

      if (isImage && obj.assetUrl) {
        const group = new THREE.Group()
        group.position.set(obj.position[0], obj.position[1], obj.position[2])
        group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
        group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

        const textureLoader = new THREE.TextureLoader()
        textureLoader.load(obj.assetUrl, (texture) => {
          const aspect = texture.image.height / texture.image.width
          const imgMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.3, 0.3 * aspect),
            new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              opacity: obj.opacity,
              side: THREE.DoubleSide,
            }),
          )
          group.add(imgMesh)
        })
        anchorGroup.add(group)
      }

      if (isAudio) {
        const group = new THREE.Group()
        group.position.set(obj.position[0], obj.position[1], obj.position[2])
        group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
        group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, 0.15),
          new THREE.MeshBasicMaterial({
            color: 0xec4899,
            transparent: true,
            opacity: obj.opacity,
            side: THREE.DoubleSide,
          }),
        )
        group.add(mesh)
        anchorGroup.add(group)

        if (obj.assetUrl) {
          const audio = new Audio(obj.assetUrl)
          audio.loop = true
          audio.volume = 0.5
          ;(group as any)._audio = audio
        }
      }

      if (isButton) {
        const group = new THREE.Group()
        group.position.set(obj.position[0], obj.position[1], obj.position[2])
        group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
        group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, 0.15),
          new THREE.MeshBasicMaterial({
            color: 0x8b5cf6,
            transparent: true,
            opacity: obj.opacity,
            side: THREE.DoubleSide,
          }),
        )
        mesh.userData.clickable = true
        mesh.userData.action = obj.action
        group.add(mesh)
        anchorGroup.add(group)
      }
    }
  }, [experience.scene?.objects])

  const startAR = useCallback(async () => {
    if (!containerRef.current || !experience.marker?.targetUrl) return
    if (startingRef.current) return
    startingRef.current = true
    anchorBuiltRef.current = false

    if (!checkWebGL()) {
      setFallback("webgl")
      updateState("error")
      startingRef.current = false
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setFallback("no-camera")
      updateState("error")
      startingRef.current = false
      return
    }

    updateState("loading")
    setShowOverlay(true)
    step("Preparando câmera...")

    const cleanups: (() => void)[] = []

    try {
      const container = containerRef.current!
      const w = window.innerWidth
      const h = window.innerHeight

      const video = document.createElement("video")
      video.setAttribute("autoplay", "")
      video.setAttribute("muted", "")
      video.setAttribute("playsinline", "")
      video.style.position = "absolute"
      video.style.top = "0"
      video.style.left = "0"
      video.style.width = "100%"
      video.style.height = "100%"
      video.style.objectFit = "cover"
      video.style.zIndex = "-2"
      container.appendChild(video)
      videoRef.current = video
      cleanups.push(() => video.remove())

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      video.srcObject = stream
      cleanups.push(() => stream.getTracks().forEach((t) => t.stop()))

      await video.play()

      await new Promise<void>((resolve, reject) => {
        let attempts = 0
        const maxAttempts = 100
        const check = () => {
          attempts++
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            resolve()
          } else if (attempts >= maxAttempts) {
            reject(new Error("Video dimensions never became available after " + (attempts * 100) + "ms"))
          } else {
            setTimeout(check, 100)
          }
        }
        if (video.videoWidth > 0) {
          resolve()
        } else {
          video.addEventListener("loadedmetadata", check, { once: true })
          setTimeout(check, 200)
        }
      })

      const vw = video.videoWidth
      const vh = video.videoHeight
      step("Câmera pronta (" + vw + "x" + vh + ")")

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      })
      renderer.setSize(w, h)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.domElement.style.position = "absolute"
      renderer.domElement.style.top = "0"
      renderer.domElement.style.left = "0"
      renderer.domElement.style.width = "100%"
      renderer.domElement.style.height = "100%"
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer
      cleanups.push(() => {
        renderer.dispose()
        renderer.domElement.remove()
      })

      const scene = new THREE.Scene()
      sceneRef.current = scene
      scene.add(new THREE.AmbientLight(0xffffff, 1.5))
      const dLight = new THREE.DirectionalLight(0xffffff, 1)
      dLight.position.set(0, 1, 1)
      scene.add(dLight)

      const cam = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
      cameraRef.current = cam

      const anchorGroup = new THREE.Group()
      anchorGroup.visible = false
      anchorGroupRef.current = anchorGroup
      scene.add(anchorGroup)

      await buildSceneObjects(anchorGroup)
      step("Cena 3D pronta")

      step("Importando MindAR...")
      let Controller: any
      try {
        const mod = await import("mind-ar/dist/mindar-image.prod.js")
        Controller = mod.Controller
      } catch {
        Controller = (window as any).MINDAR?.IMAGE?.Controller
      }
      if (!Controller) throw new Error("MindAR Controller not available")
      step("MindAR importado")

      let isShowing = false

      const controller = new Controller({
        inputWidth: vw,
        inputHeight: vh,
        maxTrack: 1,
        filterMinCF: 1e-4,
        filterBeta: 0.001,
        warmupTolerance: 0,
        missTolerance: 10,
        onUpdate: (data: any) => {
          if (data.type !== "updateMatrix") return

          if (data.worldMatrix) {
            if (!isShowing) {
              isShowing = true
              anchorGroup.visible = true
              updateState("detected")
              setShowOverlay(false)
              if (detectionTimeoutRef.current) {
                clearTimeout(detectionTimeoutRef.current)
                detectionTimeoutRef.current = null
              }
              setNoDetectionWarning(false)
              anchorGroup.traverse((child: any) => {
                if (child._audio) child._audio.play().catch(() => {})
              })
            }
            const mv = data.worldMatrix
            anchorGroup.position.set(mv[12], mv[13], mv[14])
          } else {
            if (isShowing) {
              isShowing = false
              anchorGroup.visible = false
              updateState("lost")
              setShowOverlay(true)
              anchorGroup.traverse((child: any) => {
                if (child._audio) child._audio.pause()
              })
            }
          }
        },
      })

      step("Carregando marcador (.mind)...")
      const targetUrl = experience.marker.targetUrl
      step("URL: " + targetUrl.slice(0, 80))
      const mindRes = await fetch(targetUrl, { signal: AbortSignal.timeout(15000) })
      if (!mindRes.ok) throw new Error("Falha ao baixar .mind: " + mindRes.status + " " + mindRes.statusText)
      const mindBuffer = await mindRes.arrayBuffer()
      step(".mind baixado (" + (mindBuffer.byteLength / 1024).toFixed(0) + "KB). Compilando...")
      controller.addImageTargetsFromBuffer(mindBuffer)
      step("Marcador compilado. Inicializando motor...")

      try {
        controller.dummyRun(video)
      } catch (e) {
        throw new Error("Falha na inicialização do motor AR: " + String(e))
      }
      step("Motor inicializado. Iniciando tracking...")

      const proj = controller.getProjectionMatrix()
      if (proj) {
        const fov = 2 * Math.atan(1 / proj[5]) * (180 / Math.PI)
        const near = proj[14] / (proj[10] - 1)
        const far = proj[14] / (proj[10] + 1)
        cam.fov = fov || 60
        cam.near = near > 0 ? near : 0.1
        cam.far = far > 0 ? far : 1000
        cam.aspect = w / h
        cam.updateProjectionMatrix()
      }

      controller.processVideo(video)

      const resizeObserver = new ResizeObserver(() => {
        const w2 = window.innerWidth
        const h2 = window.innerHeight
        renderer.setSize(w2, h2)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        cam.aspect = w2 / h2
        cam.updateProjectionMatrix()
      })
      resizeObserver.observe(container)
      cleanups.push(() => resizeObserver.disconnect())

      const handleClick = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycasterRef.current.setFromCamera(pointerRef.current, cam)

        const clickables: THREE.Object3D[] = []
        anchorGroup.traverse((child: any) => {
          if (child.isMesh && child.userData.clickable) clickables.push(child)
        })

        const intersects = raycasterRef.current.intersectObjects(clickables)
        if (intersects.length > 0) {
          const hit = intersects[0].object
          const action = hit.userData.action as string
          if (action) handleAction(action)
        }
      }
      renderer.domElement.addEventListener("click", handleClick)
      cleanups.push(() => renderer.domElement.removeEventListener("click", handleClick))

      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate)

        if (anchorGroup.visible) {
          anchorGroup.traverse((child: any) => {
            if (child.userData?.videoTexture) {
              child.userData.videoTexture.needsUpdate = true
            }
            if (child._mixer) {
              child._mixer.update(0.016)
            }
            if (child.userData?.animationType === "float" && child.parent) {
              child.parent.position.y += Math.sin(Date.now() / 1000 * 4) * 0.0001
            }
            if (child.userData?.animationType === "pulse" && child.parent) {
              const s = 1 + Math.sin(Date.now() / 300) * 0.05
              child.parent.scale.set(s, s, s)
            }
          })
        }

        renderer.render(scene, cam)
      }

      animate()

      const scanTimeout = setTimeout(() => {
        if (arStateRef.current === "loading") updateState("scanning")
      }, 1500)

      detectionTimeoutRef.current = setTimeout(() => {
        if (arStateRef.current !== "detected") setNoDetectionWarning(true)
      }, 30000)

      const fullCleanup = () => {
        cancelAnimationFrame(animFrameRef.current)
        controller.stopProcessVideo()
        clearTimeout(scanTimeout)
        if (detectionTimeoutRef.current) {
          clearTimeout(detectionTimeoutRef.current)
          detectionTimeoutRef.current = null
        }
        cleanups.forEach((fn) => fn())
        videoRef.current = null
        rendererRef.current = null
        sceneRef.current = null
        cameraRef.current = null
        startingRef.current = false
      }

      cleanupRef.current = fullCleanup
      return fullCleanup
    } catch (err) {
      console.error("AR start error:", err)
      startingRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      cleanups.forEach((fn) => fn())

      const msg = String(err)
      if (msg.includes("getUserMedia") || msg.includes("permission") || msg.includes("NotAllowed")) {
        setFallback("camera-permission")
      } else if (msg.includes("Timeout") || msg.includes("fetch") || msg.includes("NetworkError")) {
        setStartError("Falha ao carregar recursos AR. Verifique sua conexão de internet e tente novamente.")
      } else if (msg.includes("Controller") || msg.includes("import")) {
        setStartError("Falha ao carregar o motor AR. Seu navegador pode não ser compatível.")
      } else if (msg.includes("compile") || msg.includes("target") || msg.includes("invalid")) {
        setStartError("Arquivo de marcador inválido. Recompile o marcador no editor.")
      } else {
        setStartError("Erro ao iniciar AR: " + msg.slice(0, 120))
      }
      updateState("error")
    }
  }, [experience, checkWebGL, updateState, handleAction, buildSceneObjects])

  useEffect(() => {
    if (!experience.marker?.targetUrl) {
      setFallback("no-camera")
      updateState("error")
      return
    }

    let cleanup: (() => void) | undefined

    const init = async () => {
      cleanup = await startAR()
    }

    init()

    return () => {
      cleanup?.()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [experience.marker?.targetUrl, startAR, updateState, initKey])

  const handleSwitchCamera = useCallback(() => {}, [])

  const handleRetry = useCallback(() => {
    setFallback(null)
    setStartError(null)
    setNoDetectionWarning(false)
    step("")
    setInitKey((k) => k + 1)
  }, [step])

  if (fallback === "webgl") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <WebGLUnavailable />
      </div>
    )
  }

  if (fallback === "no-camera") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <NoCamera />
      </div>
    )
  }

  if (fallback === "camera-permission") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <CameraPermissionDenied onRetry={handleRetry} />
      </div>
    )
  }

  if (startError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="text-center max-w-xs">
          <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Erro ao Iniciar</h2>
          <p className="text-sm text-white/60 mb-8">{startError}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-xl bg-white/10 text-white/80 text-sm hover:bg-white/20 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <div ref={containerRef} className="fixed inset-0" />

      {showOverlay && (
        <>
          {arState === "loading" && (
            <div className="absolute top-8 left-1/2 z-10 -translate-x-1/2">
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10">
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                <div className="flex flex-col">
                  <span className="text-white/90 text-xs font-medium">Inicializando AR...</span>
                  <span className="text-white/40 text-[10px] mt-0.5">{initStep}</span>
                </div>
              </div>
            </div>
          )}
          {arState === "scanning" && !noDetectionWarning && (
            <div className="absolute top-8 left-1/2 z-10 -translate-x-1/2">
              <div className="px-4 py-2 rounded-full bg-black/20 backdrop-blur-sm">
                <p className="text-white/80 text-xs">Aponte a câmera para o marcador</p>
              </div>
            </div>
          )}
          {(arState === "scanning" || arState === "lost") && noDetectionWarning && (
            <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/10">
              <MarkerNotFound onRetry={handleRetry} />
            </div>
          )}
        </>
      )}

      {arState !== "loading" && arState !== "error" && (
        <div className="absolute bottom-6 left-0 right-0 z-20">
          <ArActions
            videoRef={videoRef}
            containerRef={containerRef}
            onSwitchCamera={handleSwitchCamera}
            markerDetected={arState === "detected"}
          />
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 z-20 p-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-secondary">
              <span className="text-white text-[10px] font-bold">AR</span>
            </div>
            <span className="text-sm font-medium text-white/80">{experience.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono ${arState === "detected" ? "text-emerald-400" : "text-white/40"}`}
            >
              {arState === "detected" ? "TRACKING" : "SEARCHING"}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${arState === "detected" ? "bg-emerald-400" : "bg-white/30"}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
