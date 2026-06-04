"use client"

import { Suspense } from "react"
import { ArModel } from "./ar-model"
import { ArVideo } from "./ar-video"
import { ArButton3D } from "./ar-button"
import { AssetLoadError } from "./ar-fallbacks"
import type { ArSceneObject } from "@/lib/mindar"

interface ArSceneProps {
  objects: ArSceneObject[]
  markerWidth: number
}

export function ArSceneRenderer({ objects, markerWidth }: ArSceneProps) {
  const visibleObjects = objects.filter((obj) => obj.visible)

  return (
    <group scale={[markerWidth, markerWidth, markerWidth]}>
      {visibleObjects.map((obj) => (
        <ArObjectRenderer key={obj.id} object={obj} />
      ))}
    </group>
  )
}

function ArObjectRenderer({ object }: { object: ArSceneObject }) {
  const isModel = object.type === "modelo-3d" || object.type === "modelo-3d-animado"
  const isVideo = object.type === "video-mp4" || object.type === "video-chromakey"
  const isButton = object.type.startsWith("botao-")

  if (isModel) {
    return (
      <Suspense fallback={null}>
        <ArModel object={object} />
      </Suspense>
    )
  }

  if (isVideo) {
    return (
      <Suspense fallback={null}>
        <ArVideo object={object} />
      </Suspense>
    )
  }

  if (isButton) {
    return <ArButton3D object={object} />
  }

  return <AssetLoadError name={object.name} />
}
