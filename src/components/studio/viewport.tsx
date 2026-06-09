"use client"

import { Suspense, useMemo, useState, useCallback, useEffect } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid, Environment, ContactShadows, Text, Edges, useVideoTexture, useTexture, useGLTF, useAnimations } from "@react-three/drei"
import { useStudioStore, projectTypeDimensions } from "@/store"
import { StudioElement } from "@/types"
import * as THREE from "three"

const socialColors: Record<string, string> = {
  "botao-whatsapp": "#25D366",
  "botao-site": "#3b82f6",
  "botao-instagram": "#E4405F",
  "botao-ligar": "#22c55e",
  "botao-email": "#ef4444",
}

const socialLabels: Record<string, string> = {
  "botao-whatsapp": "WhatsApp",
  "botao-site": "Site",
  "botao-instagram": "Instagram",
  "botao-ligar": "Ligar",
  "botao-email": "Email",
}

const svgUrls: Record<string, string> = {
  "botao-whatsapp": "/whatsapp-icon.svg",
  "botao-ligar": "/phone-icon.svg",
}

function createBrandTexture(type: string, onReady?: () => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext("2d")!

  const color = socialColors[type] || "#666"

  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true

  const svgUrl = svgUrls[type]
  if (svgUrl) {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 12, 12, 104, 104)
      texture.needsUpdate = true
      onReady?.()
    }
    img.src = svgUrl
  } else {
    ctx.fillStyle = "white"
    ctx.strokeStyle = "white"
    ctx.lineWidth = 7
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    switch (type) {
      case "botao-instagram": {
        ctx.lineWidth = 6
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.beginPath()
        ctx.roundRect(30, 36, 68, 56, 14)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(64, 64, 18, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(82, 44, 4, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case "botao-site": {
        ctx.lineWidth = 5
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.arc(64, 64, 34, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.ellipse(64, 64, 34, 12, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(64, 30)
        ctx.lineTo(64, 98)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(30, 64)
        ctx.lineTo(98, 64)
        ctx.stroke()
        break
      }
      case "botao-email": {
        ctx.lineWidth = 5
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.roundRect(30, 44, 68, 44, 6)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(30, 44)
        ctx.lineTo(64, 72)
        ctx.lineTo(98, 44)
        ctx.stroke()
        break
      }
    }
  }

  return texture
}

function SizeReference() {
  const { projectType } = useStudioStore()
  const dims = projectTypeDimensions[projectType]
  const w = dims.width
  const h = dims.height

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#7c3aed"
          transparent
          opacity={0.06}
          side={2}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, 0, -0.015]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          color="#7c3aed"
          transparent
          opacity={0.12}
          wireframe
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[w, h]} />
        <Edges color="#7c3aed" opacity={0.5} transparent />
      </mesh>

      <Text
        position={[0, h / 2 + 0.15, 0]}
        fontSize={0.08}
        color="#7c3aed"
        anchorX="center"
        anchorY="bottom"
      >
        {dims.label}
      </Text>
    </group>
  )
}

function Model3D({ element }: { element: StudioElement }) {
  const isAnimado = element.type === "modelo-3d-animado"

  if (!element.assetUrl) {
    return isAnimado ? (
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color="#06b6d4"
          roughness={0.2}
          metalness={0.3}
          opacity={element.opacity}
          transparent={element.opacity < 1}
        />
      </mesh>
    ) : (
      <mesh>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial
          color="#7c3aed"
          roughness={0.3}
          metalness={0.2}
          opacity={element.opacity}
          transparent={element.opacity < 1}
        />
      </mesh>
    )
  }

  const { scene, animations } = useGLTF(element.assetUrl)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    if (isAnimado && actions && Object.keys(actions).length > 0) {
      const action = actions[Object.keys(actions)[0]]
      if (action) { action.reset(); action.play() }
    }
  }, [actions, isAnimado])

  return <primitive object={scene} />
}

function VideoPlane({ element }: { element: StudioElement }) {
  const videoOpts = useMemo(() => ({ muted: true, loop: true, start: true }), [])
  const texture = useVideoTexture(element.assetUrl || "/mp4-default.mp4", videoOpts)

  return (
    <mesh>
      <planeGeometry args={[1.5, 0.85]} />
      <meshBasicMaterial map={texture} side={2} opacity={element.opacity} transparent={element.opacity < 1} />
    </mesh>
  )
}

const chromaKeyVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const chromaKeyFrag = `
  uniform sampler2D uTexture;
  uniform vec3 uKeyColor;
  uniform float uTolerance;
  uniform float uSmoothness;
  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(uTexture, vUv);
    float d = distance(color.rgb, uKeyColor);
    float a = smoothstep(uTolerance - uSmoothness, uTolerance + uSmoothness, d);
    gl_FragColor = vec4(color.rgb, a);
  }
`

function ChromaKeyPlane({ element }: { element: StudioElement }) {
  const videoOpts = useMemo(() => ({ muted: true, loop: true, start: true }), [])
  const texture = useVideoTexture(element.assetUrl || "/chormakey-default.mp4", videoOpts)

  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uKeyColor: { value: new THREE.Color(element.chromaKeyColor || "#00ff00") },
    uTolerance: { value: element.chromaKeyTolerance ?? 0.15 },
    uSmoothness: { value: element.chromaKeySmoothness ?? 0.1 },
  }), [texture, element.chromaKeyColor, element.chromaKeyTolerance, element.chromaKeySmoothness])

  return (
    <mesh>
      <planeGeometry args={[1.5, 0.85]} />
      <shaderMaterial
        vertexShader={chromaKeyVert}
        fragmentShader={chromaKeyFrag}
        uniforms={uniforms}
        transparent
        side={2}
        depthWrite={false}
      />
    </mesh>
  )
}

function ImagePlane({ element }: { element: StudioElement }) {
  const texture = useTexture(element.assetUrl || "")
  return (
    <mesh>
      <planeGeometry args={[1.5, 1.5]} />
      <meshBasicMaterial map={texture} side={2} opacity={element.opacity} transparent={element.opacity < 1} />
    </mesh>
  )
}

function AudioSpeaker({ element }: { element: StudioElement }) {
  return (
    <mesh>
      <planeGeometry args={[0.6, 0.6]} />
      <meshStandardMaterial color="#ec4899" roughness={0.3} metalness={0.1} opacity={element.opacity} transparent={element.opacity < 1} />
      <Text position={[0, 0, 0.02]} fontSize={0.3} color="white" anchorX="center" anchorY="middle">
        🔊
      </Text>
    </mesh>
  )
}

function SocialButton({ element }: { element: StudioElement }) {
  const type = element.type
  const showCaption = element.showCaption !== false
  const label = socialLabels[type] || type

  const texture = useMemo(() => createBrandTexture(type), [type])

  return (
    <group>
      <mesh>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={element.opacity}
          depthWrite={false}
        />
      </mesh>
      {showCaption && (
        <group>
          <mesh position={[0, -0.36, 0.02]}>
            <planeGeometry args={[0.6, 0.15]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.5 * element.opacity} depthWrite={false} />
          </mesh>
          <Text position={[0, -0.36, 0.03]} fontSize={0.055} color="white" anchorX="center" anchorY="middle">
            {label}
          </Text>
        </group>
      )}
    </group>
  )
}

function ElementRenderer({ element }: { element: StudioElement }) {
  switch (element.type) {
    case "modelo-3d":
    case "modelo-3d-animado":
      return <Model3D element={element} />
    case "video-mp4":
      return <VideoPlane element={element} />
    case "video-chromakey":
      return <ChromaKeyPlane element={element} />
    case "imagem":
      return <ImagePlane element={element} />
    case "audio":
      return <AudioSpeaker element={element} />
    case "botao-whatsapp":
    case "botao-site":
    case "botao-instagram":
    case "botao-ligar":
    case "botao-email":
      return <SocialButton element={element} />
    default:
      return null
  }
}

function ElementWrapper({ element }: { element: StudioElement }) {
  const selectElement = useStudioStore((s) => s.selectElement)

  return (
    <group
      position={element.position}
      rotation={element.rotation}
      scale={element.scale}
      onClick={(e) => {
        e.stopPropagation()
        selectElement(element.id)
      }}
    >
      <ElementRenderer element={element} />
    </group>
  )
}

function Scene() {
  const { elements } = useStudioStore()

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-3, 3, -3]} intensity={0.3} />
      <pointLight position={[0, 3, 0]} intensity={0.3} />

      <Grid
        position={[0, -0.5, 0]}
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#2d2d3d"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#3d3d4d"
        infiniteGrid
        fadeDistance={15}
      />

      <ContactShadows
        position={[0, -0.5, 0]}
        opacity={0.4}
        scale={10}
        blur={2}
        far={4}
      />

      <SizeReference />

      {elements.filter((el) => el.visible).map((el) => (
        <ElementWrapper key={el.id} element={el} />
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#12121a" />
      </mesh>

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={1}
        maxDistance={10}
        autoRotate={false}
      />

      <Environment preset="studio" />
    </>
  )
}

export function StudioViewport() {
  return (
    <div className="w-full h-full bg-gradient-to-b from-background to-muted/50">
      <Canvas
        shadows
        camera={{ position: [4, 3, 4], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => useStudioStore.getState().selectElement(null)}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  )
}
