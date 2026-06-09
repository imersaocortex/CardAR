"use client"

import { useRef, useEffect, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { ArSceneObject } from "@/lib/mindar"

interface ArVideoProps {
  object: ArSceneObject
}

export function ArVideo({ object }: ArVideoProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const textureRef = useRef<THREE.VideoTexture | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!object.assetUrl) {
      setError(true)
      return
    }

    const video = document.createElement("video")
    video.crossOrigin = "anonymous"
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.preload = "auto"
    videoRef.current = video

    const handleCanPlay = () => {
      setLoaded(true)
      video.play().catch(() => {})
    }

    video.addEventListener("canplay", handleCanPlay)
    video.addEventListener("error", () => setError(true))
    video.src = object.assetUrl
    video.load()

    return () => {
      video.removeEventListener("canplay", handleCanPlay)
      video.pause()
      video.src = ""
      video.load()
    }
  }, [object.assetUrl])

  useEffect(() => {
    if (!loaded || !videoRef.current) return

    const texture = new THREE.VideoTexture(videoRef.current)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.format = THREE.RGBAFormat

    if (object.chromaKeyColor) {
      texture.needsUpdate = true
    }

    textureRef.current = texture
  }, [loaded, object.chromaKeyColor])

  useFrame(() => {
    if (textureRef.current) {
      textureRef.current.needsUpdate = true
    }
  })

  const hasChromaKey = object.type === "video-chromakey"

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const fragmentShader = hasChromaKey
    ? `
    uniform sampler2D uTexture;
    uniform vec3 uChromaKey;
    uniform float uTolerance;
    uniform float uSmoothness;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(uTexture, vUv);
      vec3 diff = abs(color.rgb - uChromaKey);
      float dist = length(diff);
      float alpha = 1.0 - smoothstep(uTolerance - uSmoothness, uTolerance + uSmoothness, dist);
      gl_FragColor = vec4(color.rgb, color.a * (1.0 - alpha));
    }
  `
    : `
    uniform sampler2D uTexture;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(uTexture, vUv);
      gl_FragColor = color;
    }
  `

  const chromaKeyColor = object.chromaKeyColor || "#00ff00"
  const chromaKeyVec = new THREE.Color(chromaKeyColor)
  const tolerance = object.chromaKeyTolerance ?? 0.3
  const smoothness = object.chromaKeySmoothness ?? 0.1

  if (error || !object.assetUrl) {
    return (
      <mesh position={[0, 0.05, 0]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial color="#dc2626" opacity={0.5} transparent />
      </mesh>
    )
  }

  if (!loaded && !error) {
    return (
      <mesh position={[0, 0.05, 0]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial color="#8b5cf6" opacity={0.3} transparent />
      </mesh>
    )
  }

  return (
    <mesh
      ref={meshRef}
      position={object.position}
      rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]}
      scale={object.scale}
      visible={object.visible}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTexture: { value: textureRef.current || new THREE.Texture() },
          uChromaKey: { value: chromaKeyVec },
          uTolerance: { value: tolerance },
          uSmoothness: { value: smoothness },
        }}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}
