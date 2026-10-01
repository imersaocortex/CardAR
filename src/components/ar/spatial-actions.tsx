"use client"
import { getActionUrl } from "@/lib/ar/actions"
import type { ArSceneObject } from "@/lib/mindar"

export function SpatialActions({ objects, onInteraction }: { objects: ArSceneObject[]; onInteraction?: (event: string, metadata?: Record<string, unknown>) => void }) {
  return <>{objects.filter((object) => object.visible && object.type.startsWith("botao-") && object.action).map((object) => {
    const url = getActionUrl(object.action!)
    return url ? <a key={object.id} href={url} target={url.startsWith("https:") || url.startsWith("http:") ? "_blank" : undefined} rel="noopener noreferrer" className="rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm text-white" onClick={() => onInteraction?.("button_click", { object_id: object.id, action_value: url })}>{object.name}</a> : null
  })}</>
}
