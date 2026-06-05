"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import * as THREE from "three"
import type { ArExperienceData, ArState } from "@/lib/mindar"
import { getMarkerDimensions } from "@/lib/mindar"
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
  const frameCountRef = useRef(0)
  const [renderFrame, setRenderFrame] = useState(0)
  const [worldPos, setWorldPos] = useState("")

  const [arState, setArState] = useState<ArState>("loading")
  const [fallback, setFallback] = useState<"camera-permission" | "no-camera" | "webgl" | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [initKey, setInitKey] = useState(0)
  const [noDetectionWarning, setNoDetectionWarning] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [initStep, setInitStep] = useState("")
  const [objectCount, setObjectCount] = useState(0)
  const [threeReady, setThreeReady] = useState(false)

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

    setObjectCount(experience.scene.objects.length)

    const dims = getMarkerDimensions(experience.type || "square_1x1")
    const mw = dims.width

    for (const obj of experience.scene.objects) {
      const isModel = obj.type === "modelo-3d" || obj.type === "modelo-3d-animado"
      const isVideo = obj.type === "video-mp4" || obj.type === "video-chromakey"
      const isImage = obj.type === "imagem"
      const isAudio = obj.type === "audio"
      const isButton = obj.type.startsWith("botao-")

      if (!obj.visible) continue

      const group = new THREE.Group()
      group.position.set(obj.position[0] * mw, obj.position[1] * mw, obj.position[2] * mw)
      group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
      group.scale.set(obj.scale[0] * mw, obj.scale[1] * mw, obj.scale[2] * mw)

      if (isModel) {
        const placeholder = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.8, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.3, metalness: 0.2, transparent: true, opacity: obj.opacity }),
        )
        placeholder.userData.animationType = obj.animationType
        placeholder.userData.assetUrl = obj.assetUrl
        group.add(placeholder)

        if (obj.assetUrl) {
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
          const loader = new GLTFLoader()
          loader.load(
            obj.assetUrl,
            (gltf: any) => {
              const model = gltf.scene
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
        const meshMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), meshMat)
        mesh.userData.isVideo = true
        mesh.userData.objectId = obj.id
        mesh.userData.assetUrl = obj.assetUrl
        mesh.userData.chromaKeyColor = obj.chromaKeyColor
        mesh.userData.chromaKeyTolerance = obj.chromaKeyTolerance ?? 0.4
        mesh.userData.chromaKeySmoothness = obj.chromaKeySmoothness ?? 0.1
        group.add(mesh)

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
                side: THREE.DoubleSide,
                depthWrite: false,
              })
            } else {
              meshMat.dispose()
              ;(mesh as any).material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
              })
            }

            mesh.userData.videoTexture = texture
            mesh.userData.video = v
            v.play().catch(() => {})
          })
        }
      }

      if (isImage) {
        const placeholder = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 1.5),
          new THREE.MeshBasicMaterial({ color: 0xec4899, transparent: true, opacity: obj.opacity, side: THREE.DoubleSide }),
        )
        group.add(placeholder)

        if (obj.assetUrl) {
          const textureLoader = new THREE.TextureLoader()
          textureLoader.load(obj.assetUrl, (texture) => {
            const imgMesh = new THREE.Mesh(
              new THREE.PlaneGeometry(1.5, 1.5),
              new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: obj.opacity,
                side: THREE.DoubleSide,
              }),
            )
            group.remove(placeholder)
            group.add(imgMesh)
          })
        }
      }

      if (isAudio) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 0.6),
          new THREE.MeshStandardMaterial({
            color: 0xec4899,
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: obj.opacity,
          }),
        )
        group.add(mesh)

        if (obj.assetUrl) {
          const audio = new Audio(obj.assetUrl)
          audio.loop = true
          audio.volume = 0.5
          ;(group as any)._audio = audio
        }
      }

      if (isButton) {
        function createBrandTexture(type: string): THREE.CanvasTexture {
          const canvas = document.createElement("canvas")
          canvas.width = 128
          canvas.height = 128
          const ctx = canvas.getContext("2d")!

          const socialColors2: Record<string, string> = {
            "botao-whatsapp": "#25D366",
            "botao-site": "#3b82f6",
            "botao-instagram": "#E4405F",
            "botao-ligar": "#22c55e",
            "botao-email": "#ef4444",
          }

          ctx.beginPath()
          ctx.arc(64, 64, 60, 0, Math.PI * 2)
          ctx.fillStyle = socialColors2[type] || "#666"
          ctx.fill()

          const tex = new THREE.CanvasTexture(canvas)
          tex.needsUpdate = true

          const svgUrls2: Record<string, string> = {
            "botao-whatsapp": "/whatsapp-icon.svg",
            "botao-ligar": "/phone-icon.svg",
          }

          const svgUrl = svgUrls2[type]
          if (svgUrl) {
            const img = new Image()
            img.onload = () => {
              ctx.drawImage(img, 12, 12, 104, 104)
              tex.needsUpdate = true
            }
            img.src = svgUrl
          } else {
            ctx.fillStyle = "white"
            ctx.strokeStyle = "white"
            ctx.lineWidth = 7
            ctx.lineCap = "round"
            ctx.lineJoin = "round"

            if (type === "botao-instagram") {
              ctx.lineWidth = 6
              ctx.beginPath()
              ctx.roundRect(30, 36, 68, 56, 14); ctx.stroke()
              ctx.beginPath()
              ctx.arc(64, 64, 18, 0, Math.PI * 2); ctx.stroke()
              ctx.beginPath()
              ctx.arc(82, 44, 4, 0, Math.PI * 2); ctx.fill()
            } else if (type === "botao-site") {
              ctx.lineWidth = 5
              ctx.beginPath()
              ctx.arc(64, 64, 34, 0, Math.PI * 2); ctx.stroke()
              ctx.beginPath()
              ctx.ellipse(64, 64, 34, 12, 0, 0, Math.PI * 2); ctx.stroke()
              ctx.beginPath()
              ctx.moveTo(64, 30); ctx.lineTo(64, 98); ctx.stroke()
              ctx.beginPath()
              ctx.moveTo(30, 64); ctx.lineTo(98, 64); ctx.stroke()
            } else if (type === "botao-email") {
              ctx.lineWidth = 5
              ctx.beginPath()
              ctx.roundRect(30, 44, 68, 44, 6); ctx.stroke()
              ctx.beginPath()
              ctx.moveTo(30, 44); ctx.lineTo(64, 72); ctx.lineTo(98, 44); ctx.stroke()
            }
          }

          return tex
        }

        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.5, 0.5),
          new THREE.MeshBasicMaterial({
            map: createBrandTexture(obj.type),
            transparent: true,
            opacity: obj.opacity,
          }),
        )
        mesh.userData.clickable = true
        mesh.userData.action = obj.action
        group.add(mesh)

        const socialLabels2: Record<string, string> = {
          "botao-whatsapp": "WhatsApp",
          "botao-site": "Site",
          "botao-instagram": "Instagram",
          "botao-ligar": "Ligar",
          "botao-email": "Email",
        }

        if (obj.showCaption) {
          const capCanvas = document.createElement("canvas")
          capCanvas.width = 256
          capCanvas.height = 64
          const capCtx = capCanvas.getContext("2d")!
          capCtx.fillStyle = "rgba(0,0,0,0.5)"
          capCtx.roundRect(0, 0, 256, 64, 12); capCtx.fill()
          capCtx.fillStyle = "white"
          capCtx.font = "bold 28px sans-serif"
          capCtx.textAlign = "center"
          capCtx.textBaseline = "middle"
          capCtx.fillText(socialLabels2[obj.type] || obj.name || obj.type, 128, 34)

          const capTex = new THREE.CanvasTexture(capCanvas)
          capTex.needsUpdate = true
          const capPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.15),
            new THREE.MeshBasicMaterial({ map: capTex, transparent: true, depthWrite: false, opacity: obj.opacity }),
          )
          capPlane.position.set(0, -0.36, 0.02)
          group.add(capPlane)
        }
      }

      anchorGroup.add(group)
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
      video.width = vw
      video.height = vh
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
      setThreeReady(true)

      const anchorGroup = new THREE.Group()
      anchorGroup.visible = false
      anchorGroupRef.current = anchorGroup
      scene.add(anchorGroup)

      await buildSceneObjects(anchorGroup)
      step("Cena 3D pronta")

      step("Importando MindAR...")
      let MindAR: any
      try {
        const mod = await import("mind-ar/dist/mindar-image.prod.js")
        MindAR = mod
      } catch {
        MindAR = (window as any).MINDAR?.IMAGE
      }
      if (!MindAR || !MindAR.Controller) throw new Error("MindAR Controller not available")
      step("MindAR importado")

      step("Preparando marcador...")
      const targetUrl = experience.marker!.targetUrl
      const imageUrl = experience.marker!.imageUrl

      // Try .mind file first (pre-compiled), fall back to compiling from image
      let mindBuffer: ArrayBuffer | Uint8Array | null = null
      let loadedAsImage = false

      if (targetUrl) {
        step("Baixando .mind: " + targetUrl.slice(0, 50))
        try {
          const res = await fetch("/api/storage/download?url=" + encodeURIComponent(targetUrl))
          if (res.ok) {
            let buf = await res.arrayBuffer()
            step(".mind baixado (" + (buf.byteLength / 1024).toFixed(0) + "KB)")

            // Trim trailing garbage bytes (MessagePack encoder bug)
            let trimmed = buf.byteLength
            try {
              const testCompiler = new MindAR.Compiler()
              testCompiler.importData(new Uint8Array(buf))
            } catch (e2: any) {
              const m2 = String(e2).match(/buffer\[(\d+)\]/)
              if (m2) trimmed = parseInt(m2[1])
            }
            if (trimmed < buf.byteLength) {
              step("Ajustado (" + trimmed + "/" + buf.byteLength + " bytes)")
              buf = buf.slice(0, trimmed)
            }
            mindBuffer = buf
          } else {
            step(".mind falhou (" + res.status + "), tentando imagem...")
          }
        } catch (e) {
          step(".mind erro: " + String(e).slice(0, 60))
        }
      }

      if (!mindBuffer) {
        loadedAsImage = true
        step("Baixando imagem do marcador...")
        const imgRes = await fetch("/api/storage/download?url=" + encodeURIComponent(imageUrl))
        if (!imgRes.ok) throw new Error("Falha ao baixar imagem (" + imgRes.status + ")")
        const imgBuf = await imgRes.arrayBuffer()
        const imgBlobUrl = URL.createObjectURL(new Blob([imgBuf]))
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error("Falha ao decodificar imagem"))
          img.src = imgBlobUrl
        })
        URL.revokeObjectURL(imgBlobUrl)
        step("Imagem (" + img.naturalWidth + "x" + img.naturalHeight + "). Compilando...")

        const compiler = new MindAR.Compiler()
        await compiler.compileImageTargets([img], () => {})
        mindBuffer = compiler.exportData()
        step("Compilado (" + (mindBuffer!.byteLength / 1024).toFixed(0) + "KB)")
      }

      const finalBuffer = mindBuffer!
      let isShowing = false
      let frameCount = 0

      if (loadedAsImage) {
        step("Imagem compilada (" + (finalBuffer.byteLength / 1024).toFixed(0) + "KB)")
      }

      const controller = new MindAR.Controller({
        inputWidth: vw,
        inputHeight: vh,
        maxTrack: 1,
        filterMinCF: 0.005,
        filterBeta: 0.01,
        warmupTolerance: 0,
        missTolerance: 5,
        onUpdate: (data: any) => {
          if (data.type === "processDone") {
            frameCount++
            return
          }
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
            const mr = new THREE.Matrix4().fromArray(mv)
            const mp = new THREE.Vector3()
            const mq = new THREE.Quaternion()
            mr.decompose(mp, mq, new THREE.Vector3())
            anchorGroup.position.set(mp.x / 1000, mp.y / 1000, mp.z / 1000)
            anchorGroup.quaternion.copy(mq)
            setWorldPos(`${(mp.x/1000).toFixed(3)},${(mp.y/1000).toFixed(3)},${(mp.z/1000).toFixed(3)}`)
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

      step("Adicionando marcador ao tracker...")
      controller.addImageTargetsFromBuffer(finalBuffer)
      step("Marcador pronto. Inicializando motor...")

      try {
        controller.dummyRun(video)
      } catch (e) {
        throw new Error("Falha na inicialização do motor AR: " + String(e))
      }
      step("Motor inicializado. Iniciando tracking...")

      cam.fov = 60
      cam.near = 0.1
      cam.far = 1000
      cam.aspect = w / h
      cam.updateProjectionMatrix()

      controller.processVideo(video)
      step("Tracking iniciado")

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
        frameCountRef.current++
        if (frameCountRef.current % 30 === 0) setRenderFrame(frameCountRef.current)

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

      <div className="absolute bottom-2 left-2 z-30 flex flex-wrap gap-1 max-w-[90vw]">
        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-black/60 text-white/80">
          F:{renderFrame}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-black/60 text-white/80">
          3D:{objectCount}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-black/60 text-white/80">
          {threeReady ? "✓THREE" : "✗THREE"}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-black/60 text-white/80">
          {anchorGroupRef.current?.visible ? "✓VIS" : "✗VIS"}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-black/60 text-white/80">
          {worldPos || "no mv"}
        </span>
      </div>
    </div>
  )
}
