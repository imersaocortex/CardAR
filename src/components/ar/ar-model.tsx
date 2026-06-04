"use client"

import { useRef, useEffect, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { useGLTF, useAnimations } from "@react-three/drei"
import * as THREE from "three"
import type { ArSceneObject } from "@/lib/mindar"

interface ArModelProps {
  object: ArSceneObject
}

export function ArModel({ object }: ArModelProps) {
  const meshRef = useRef<THREE.Group>(null)
  const [error, setError] = useState(false)
  const assetUrl = object.assetUrl || "/placeholder.glb"

  let gltf: THREE.Object3D | undefined
  let animations: THREE.AnimationClip[] = []

  try {
    const result = useGLTF(assetUrl, true)
    gltf = result.scene
    animations = result.animations || []
  } catch {
    setError(true)
  }

  const { actions } = useAnimations(animations, gltf ? { current: gltf } : undefined)

  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      const action = actions[Object.keys(actions)[0]]
      if (action) {
        action.reset()
        action.play()
      }
    }
  }, [actions])

  useFrame((state, delta) => {
    if (!meshRef.current) return

    if (object.animationType === "float") {
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.05
    }
    if (object.animationType === "rotate") {
      meshRef.current.rotation.y += delta * 0.5
    }
    if (object.animationType === "pulse") {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.05
      meshRef.current.scale.set(scale, scale, scale)
    }
  })

  if (error || !gltf) {
    return (
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#8b5cf6" opacity={object.opacity} transparent />
      </mesh>
    )
  }

  return (
    <primitive
      ref={meshRef}
      object={gltf}
      position={object.position}
      rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]}
      scale={object.scale}
      visible={object.visible}
    />
  )
}
