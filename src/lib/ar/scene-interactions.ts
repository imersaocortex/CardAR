import * as THREE from "three"
import { getActionUrl } from "./actions"

export const PARTICLE_LINK_DELAY_MS = 2500

export type SceneInteraction = { objectId: string; projectId?: string; action: string | null; effect: "none" | "particles" }
export type SceneHit = { interaction: SceneInteraction; group: THREE.Object3D; point: THREE.Vector3 }

export function registerSceneInteraction(group: THREE.Object3D, object: { id: string; action?: string | null; clickEffect?: string | null }, projectId?: string) {
  if (!getActionUrl(object.action ?? "") && object.clickEffect !== "particles") return
  group.userData.sceneInteraction = {
    objectId: object.id, projectId, action: getActionUrl(object.action ?? ""), effect: object.clickEffect === "particles" ? "particles" : "none",
  } satisfies SceneInteraction
}

// THREE's raycaster does not exclude invisible parents. Filter the full chain,
// then select only the nearest object so overlapping projects never open two links.
export function pickSceneInteraction(roots: THREE.Object3D[], raycaster: THREE.Raycaster): SceneHit | null {
  roots.forEach((root) => root.updateWorldMatrix(true, true))
  for (const hit of raycaster.intersectObjects(roots, true)) {
    if (!(hit.object instanceof THREE.Mesh)) continue
    let group: THREE.Object3D | undefined
    let visible = true
    for (let parent: THREE.Object3D | null = hit.object; parent; parent = parent.parent) {
      if (!parent.visible) visible = false
      if (!group && parent.userData.sceneInteraction) group = parent
    }
    if (!visible) continue
    // A visible object without an action still occludes objects behind it.
    // Never activate another project's URL through the front of that object.
    return group ? { interaction: group.userData.sceneInteraction as SceneInteraction, group, point: hit.point } : null
  }
  return null
}

export function pickSceneInteractionAt(roots: THREE.Object3D[], camera: THREE.Camera, bounds: { left: number; top: number; width: number; height: number }, x: number, y: number) {
  if (bounds.width <= 0 || bounds.height <= 0 || x < bounds.left || x > bounds.left + bounds.width || y < bounds.top || y > bounds.top + bounds.height) return null
  camera.updateWorldMatrix(true, false)
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((x - bounds.left) / bounds.width * 2 - 1, -(y - bounds.top) / bounds.height * 2 + 1), camera)
  return pickSceneInteraction(roots, ray)
}

export function createSceneInteractionHandler(effects: { burst: (hit: SceneHit) => void }, onInteraction?: (event: string, metadata?: Record<string, unknown>) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    activate(hit: SceneHit) {
      if (timer !== undefined) return
      const { action: url, effect, objectId, projectId } = hit.interaction
      if (effect === "particles") effects.burst(hit)
      onInteraction?.("button_click", {
        object_id: objectId, project_id: projectId, action_value: url, click_effect: effect,
      })
      if (!url) return

      if (effect === "particles") {
        // Stay in the current tab so the effect is visible and the delayed
        // navigation does not depend on the browser allowing a popup.
        timer = setTimeout(() => {
          timer = undefined
          window.location.href = url
        }, PARTICLE_LINK_DELAY_MS)
        return
      }

      if (/^https?:/i.test(url)) {
        const popup = window.open("", "_blank")
        if (popup) {
          popup.opener = null
          popup.location.replace(url)
          return
        }
      }
      window.location.href = url
    },
    cancel() {
      clearTimeout(timer)
      timer = undefined
    },
  }
}

export function attachSceneClicks(canvas: HTMLCanvasElement, roots: THREE.Object3D[], camera: THREE.Camera, effects: { burst: (hit: SceneHit) => void }, options: { enabled?: () => boolean; onInteraction?: (event: string, metadata?: Record<string, unknown>) => void } = {}) {
  const handler = createSceneInteractionHandler(effects, options.onInteraction)
  const click = (event: MouseEvent) => {
    if (options.enabled && !options.enabled()) return
    const hit = pickSceneInteractionAt(roots, camera, canvas.getBoundingClientRect(), event.clientX, event.clientY)
    if (hit) handler.activate(hit)
  }
  canvas.addEventListener("click", click)
  return () => {
    handler.cancel()
    canvas.removeEventListener("click", click)
  }
}
