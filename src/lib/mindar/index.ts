"use client"

export type ArState = "loading" | "scanning" | "detected" | "lost" | "error"

export interface ArSceneObject {
  id: string
  type: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  opacity: number
  visible: boolean
  animationType: string | null
  action: string | null
  assetUrl: string | null
  assetThumbnail: string | null
  showCaption: boolean | null
  chromaKeyColor: string | null
  chromaKeyTolerance: number | null
  chromaKeySmoothness: number | null
  duration: number | null
  buttons?: {
    id: string
    label: string
    icon: string | null
    actionType: string
    actionValue: string
  }[]
}

export interface ArExperienceData {
  id: string
  name: string
  type: string
  thumbnailUrl: string | null
  marker: {
    imageUrl: string
    targetUrl: string | null
  } | null
  scene: {
    id: string
    name: string
    backgroundColor: string
    objects: ArSceneObject[]
  } | null
}

export function getMarkerDimensions(type: string): { width: number; height: number } {
  switch (type) {
    case "business_card":
      return { width: 0.85, height: 0.55 }
    case "flyer_a4":
      return { width: 2.1, height: 2.97 }
    case "square_1x1":
    default:
      return { width: 1, height: 1 }
  }
}
