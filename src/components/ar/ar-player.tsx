"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import * as THREE from "three"
import type { ArExperienceData, ArState, ArSceneObject } from "@/lib/mindar"
import { ArActions } from "./ar-actions"
import { CameraPermissionDenied, NoCamera, WebGLUnavailable, MarkerNotFound } from "./ar-fallbacks"

interface ArPlayerProps {
  experience: ArExperienceData
  onStateChange?: (state: ArState) => void
}

export function ArPlayer({ experience, onStateChange }: ArPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mindarRef = useRef<any>(null)
  const animFrameRef = useRef<number>(0)
  const anchorObjRef = useRef<any>(null)
  const startingRef = useRef(false)

  const [arState, setArState] = useState<ArState>("loading")
  const [fallback, setFallback] = useState<"camera-permission" | "no-camera" | "webgl" | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [initKey, setInitKey] = useState(0)
  const [noDetectionWarning, setNoDetectionWarning] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const detectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const updateState = useCallback(
    (state: ArState) => {
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

  const startAR = useCallback(async () => {
    if (!containerRef.current || !experience.marker?.targetUrl) return
    if (startingRef.current) return
    startingRef.current = true

    if (!checkWebGL()) {
      setFallback("webgl")
      updateState("error")
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setFallback("no-camera")
      updateState("error")
      return
    }

    updateState("loading")
    setShowOverlay(true)

    try {
      // Dynamic import of MindAR (with patched fs)
      const mindarModule = await import("mind-ar/dist/mindar-image-three.prod.js")
      const MindARThree = mindarModule.MindARThree || (window as any).MINDAR?.IMAGE?.MindARThree
      if (!MindARThree) {
        throw new Error("MindARThree not available")
      }

      const mindarThree = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: experience.marker.targetUrl,
        maxTrack: 1,
        filterMinCF: 1e-4,
        filterBeta: 0.001,
        warmupTolerance: 0,
        missTolerance: 10,
        uiLoading: "no",
        uiScanning: "no",
        uiError: "no",
      })

      mindarRef.current = mindarThree

      const anchor = mindarThree.addAnchor(0)
      anchorObjRef.current = anchor

      anchor.onTargetFound = () => {
        updateState("detected")
        setShowOverlay(false)
        if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current)
      }

      anchor.onTargetLost = () => {
        updateState("lost")
        setShowOverlay(true)
      }

      // Create scene objects on the anchor
      if (experience.scene?.objects) {
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
            placeholder.userData.isModel = true
            placeholder.userData.objectId = obj.id
            placeholder.userData.animationType = obj.animationType
            placeholder.userData.assetUrl = obj.assetUrl
            group.add(placeholder)

            anchor.group.add(group)

            // Load GLTF if URL present
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

                  // Play animations if present
                  if (gltf.animations?.length && obj.animationType !== "none") {
                    const mixer = new THREE.AnimationMixer(model)
                    const action = mixer.clipAction(gltf.animations[0])
                    action.play()
                    mixer.update(0)
                    ;(model as any)._mixer = mixer
                  }
                },
                undefined,
                () => {
                  // Keep placeholder on error
                },
              )
            }
          }

          if (isVideo) {
            const group = new THREE.Group()
            group.position.set(obj.position[0], obj.position[1], obj.position[2])
            group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
            group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

            const mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material | THREE.MeshBasicMaterial> = new THREE.Mesh(
              new THREE.PlaneGeometry(0.3, 0.2),
              new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.5 }),
            )
            mesh.userData.isVideo = true
            mesh.userData.objectId = obj.id
            mesh.userData.assetUrl = obj.assetUrl
            mesh.userData.chromaKeyColor = obj.chromaKeyColor
            mesh.userData.chromaKeyTolerance = obj.chromaKeyTolerance ?? 0.4
            mesh.userData.chromaKeySmoothness = obj.chromaKeySmoothness ?? 0.1
            group.add(mesh)
            anchor.group.add(group)

            if (obj.assetUrl) {
              const video = document.createElement("video")
              video.crossOrigin = "anonymous"
              video.loop = true
              video.muted = true
              video.playsInline = true
              video.autoplay = true
              video.preload = "auto"
              video.src = obj.assetUrl
              video.load()

              video.addEventListener("canplay", () => {
                const texture = new THREE.VideoTexture(video)
                texture.minFilter = THREE.LinearFilter
                texture.magFilter = THREE.LinearFilter

                const hasChromaKey = obj.type === "video-chromakey" && obj.chromaKeyColor

                if (hasChromaKey) {
                  const chromaColor = new THREE.Color(obj.chromaKeyColor!)
                  const tolerance = (obj.chromaKeyTolerance ?? 0.4) / 100
                  const smoothness = (obj.chromaKeySmoothness ?? 0.1) / 100

                  mesh.material = new THREE.ShaderMaterial({
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
                  mesh.material = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                  })
                }

                mesh.userData.videoTexture = texture
                mesh.userData.video = video
                video.play().catch(() => {})
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
              const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(0.3, 0.3 * (texture.image.height / texture.image.width)),
                new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: obj.opacity, side: THREE.DoubleSide }),
              )
              group.add(mesh)
            })
            anchor.group.add(group)
          }

          if (isAudio) {
            const group = new THREE.Group()
            group.position.set(obj.position[0], obj.position[1], obj.position[2])
            group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
            group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])

            const mesh = new THREE.Mesh(
              new THREE.PlaneGeometry(0.15, 0.15),
              new THREE.MeshBasicMaterial({ color: 0xec4899, transparent: true, opacity: obj.opacity, side: THREE.DoubleSide }),
            )
            group.add(mesh)
            anchor.group.add(group)

            if (obj.assetUrl) {
              const audio = new Audio(obj.assetUrl)
              audio.loop = true
              audio.volume = 0.5

              anchor.onTargetFound = (() => {
                const orig = anchor.onTargetFound
                return () => {
                  orig?.()
                  audio.play().catch(() => {})
                }
              })()

              anchor.onTargetLost = (() => {
                const orig = anchor.onTargetLost
                return () => {
                  orig?.()
                  audio.pause()
                }
              })()
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
            anchor.group.add(group)
          }
        }
      }

      // Start AR with timeout (30s)
      const startPromise = mindarThree.start()
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao iniciar AR. Verifique sua conexão e tente novamente.")), 30000)
      )
      await Promise.race([startPromise, timeoutPromise])
      videoRef.current = mindarThree.video

      const renderer = mindarThree.renderer
      const container = containerRef.current

      // MindAR's internal resize() handles video/canvas fullscreen positioning.
      // We just need to ensure renderer/camera update on container size changes.
      resizeObserverRef.current = new ResizeObserver(() => {
        const w = container?.clientWidth || window.innerWidth
        const h = container?.clientHeight || window.innerHeight
        renderer.setSize(w, h)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        if (mindarThree.camera?.aspect) {
          mindarThree.camera.aspect = w / h
          mindarThree.camera.updateProjectionMatrix?.()
        }
      })
      if (container) {
        resizeObserverRef.current.observe(container)
      }

      // Transition to scanning state after 1.5s (allows camera to stabilize)
      const scanTimeout = setTimeout(() => {
        updateState("scanning")
      }, 1500)

      // If marker not detected after 30s, show persistent guidance
      detectionTimeoutRef.current = setTimeout(() => {
        setNoDetectionWarning(true)
      }, 30000)

      // Handle click events for buttons
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()

      const handleClick = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(pointer, mindarThree.camera)

        const clickables: THREE.Object3D[] = []
        anchor.group.traverse((child: any) => {
          if (child.isMesh && child.userData.clickable) {
            clickables.push(child)
          }
        })

        const intersects = raycaster.intersectObjects(clickables)
        if (intersects.length > 0) {
          const hit = intersects[0].object
          const action = hit.userData.action as string
          if (action) handleAction(action)
        }
      }

      renderer.domElement.addEventListener("click", handleClick)

      // Animation loop
      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate)

        if (anchor.visible) {
          anchor.group.traverse((child: any) => {
            // Update video textures
            if (child.userData?.video && child.userData?.videoTexture) {
              child.userData.videoTexture.needsUpdate = true
            }

            // Update animation mixers
            if (child._mixer) {
              child._mixer.update(0.016)
            }

            // Float animation
            if (child.userData?.animationType === "float" && child.parent) {
              const time = Date.now() / 1000
              child.parent.position.y += Math.sin(time * 4) * 0.0001
            }

            // Pulse animation
            if (child.userData?.animationType === "pulse" && child.parent) {
              const scale = 1 + Math.sin(Date.now() / 300) * 0.05
              child.parent.scale.set(scale, scale, scale)
            }
          })
        }
      }

      animate()

      return () => {
        cancelAnimationFrame(animFrameRef.current)
        renderer.domElement.removeEventListener("click", handleClick)
        mindarThree.stop()
        clearTimeout(scanTimeout)
        if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current)
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect()
          resizeObserverRef.current = null
        }
        startingRef.current = false
      }
    } catch (err) {
      console.error("AR start error:", err)
      startingRef.current = false
      const msg = String(err)
      if (msg.includes("getUserMedia") || msg.includes("permission") || msg.includes("NotAllowed")) {
        setFallback("camera-permission")
      } else if (msg.includes("Timeout") || msg.includes("fetch") || msg.includes("NetworkError")) {
        setStartError("Falha ao carregar recursos AR. Verifique sua conexão de internet e tente novamente.")
      } else if (msg.includes("MindARThree not available") || msg.includes("dynamic") || msg.includes("import")) {
        setStartError("Falha ao carregar o motor AR. Seu navegador pode não ser compatível.")
      } else if (msg.includes("compile") || msg.includes("target") || msg.includes("invalid") || msg.includes("parse")) {
        setStartError("Arquivo de marcador inválido. Recompile o marcador no editor.")
      } else {
        setStartError("Erro ao iniciar AR: " + msg.slice(0, 120))
      }
      updateState("error")
    }
  }, [experience, checkWebGL, updateState, handleAction])

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
      if (mindarRef.current) {
        try {
          mindarRef.current.stop()
        } catch {}
      }
    }
  }, [experience.marker?.targetUrl, startAR, updateState, initKey])

  const handleSwitchCamera = useCallback(() => {
    if (mindarRef.current?.switchCamera) {
      mindarRef.current.switchCamera()
    }
  }, [])

  const handleRetry = useCallback(() => {
    setFallback(null)
    setStartError(null)
    setNoDetectionWarning(false)
    setInitKey((k) => k + 1)
  }, [])

  if (fallback === "webgl") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <WebGLUnavailable />
      </div>
    )
  }

  if (fallback === "no-camera") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <NoCamera />
      </div>
    )
  }

  if (fallback === "camera-permission") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <CameraPermissionDenied onRetry={handleRetry} />
      </div>
    )
  }

  if (startError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
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
    <div className="fixed inset-0">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {showOverlay && (
        <>
          {arState === "loading" && (
            <div className="absolute top-8 left-1/2 z-10 -translate-x-1/2">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 backdrop-blur-sm">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="text-white/80 text-xs">Inicializando AR...</span>
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
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
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
