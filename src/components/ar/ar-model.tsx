"use client"

import { useRef, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { useGLTF, useAnimations } from "@react-three/drei"
import * as THREE from "three"
import type { ArSceneObject } from "@/lib/mindar"

interface ArModelProps {
  object: ArSceneObject
}

export function ArModel({ object }: ArModelProps) {
  const groupRef = useRef<THREE.Group>(null)
  const assetUrl = object.assetUrl || "/placeholder.glb"

  const { scene, animations } = useGLTF(assetUrl, true)
  const gltf = scene
  const { actions } = useAnimations(animations, gltf ? { current: gltf } : undefined)

  useEffect(() => {
    if (object.animationType === "embedded" && actions && Object.keys(actions).length > 0) {
      const action = actions[Object.keys(actions)[0]]
      if (action) {
        action.reset()
        action.play()
      }
    }
    return () => {
      if (actions) {
        Object.values(actions).forEach((a) => a?.stop())
      }
    }
  }, [actions, object.animationType])

  useFrame((state, delta) => {
    if (!groupRef.current) return

    if (object.animationType === "float") {
      groupRef.current.position.y += Math.sin(state.clock.elapsedTime * 4) * 0.0005
    }
    if (object.animationType === "rotate") {
      groupRef.current.rotation.y += delta * 0.5
    }
    if (object.animationType === "pulse") {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.05
      groupRef.current.scale.set(s, s, s)
    }
  })

  if (!gltf) {
    return (
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#8b5cf6" opacity={object.opacity} transparent />
      </mesh>
    )
  }

  return (
    <primitive
      ref={groupRef}
      object={gltf}
      position={object.position}
      rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]}
      scale={object.scale}
      visible={object.visible}
    />
  )
}
