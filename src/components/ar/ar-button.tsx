"use client"

import { useRef, useState, useCallback } from "react"
import * as THREE from "three"
import type { ArSceneObject } from "@/lib/mindar"

interface ArButton3DProps {
  object: ArSceneObject
}

export function ArButton3D({ object }: ArButton3DProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (!object.action) return

    // Parse action format: "type:value" or plain URL
    let actionType = ""
    let actionValue = ""

    if (object.action.includes(":")) {
      const colonIndex = object.action.indexOf(":")
      actionType = object.action.substring(0, colonIndex)
      actionValue = object.action.substring(colonIndex + 1)
    } else {
      // Try to detect URL
      if (object.action.startsWith("http")) {
        actionType = "url"
        actionValue = object.action
      } else if (object.action.startsWith("tel:")) {
        actionType = "phone"
        actionValue = object.action.replace("tel:", "")
      } else if (object.action.startsWith("mailto:")) {
        actionType = "email"
        actionValue = object.action.replace("mailto:", "")
      } else {
        actionType = "url"
        actionValue = object.action
      }
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
  }, [object.action])

  const buttonLabel = object.showCaption ? object.name : ""
  const iconType = object.type.replace("botao-", "")

  const iconSymbols: Record<string, string> = {
    whatsapp: "W",
    site: "W",
    instagram: "IG",
    ligar: "T",
    email: "@",
  }

  return (
    <mesh
      ref={meshRef}
      position={object.position}
      rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]}
      scale={
        hovered
          ? [object.scale[0] * 1.1, object.scale[1] * 1.1, object.scale[2] * 1.1]
          : object.scale
      }
      visible={object.visible}
      onClick={handleClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <planeGeometry args={[0.15, 0.15]} />
      <meshStandardMaterial
        color={hovered ? "#7c3aed" : "#8b5cf6"}
        transparent
        opacity={object.opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
