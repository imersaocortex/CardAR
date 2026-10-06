import { selectPrimaryScene } from "@/lib/scenes"
import type { ArExperienceData } from "@/lib/mindar"

type SceneButtonRow = { id: string; label: string; icon: string | null; action_type: string; action_value: string }
type SceneObjectRow = {
  id: string; type: string; name: string; position_x: number; position_y: number; position_z: number
  rotation_x: number; rotation_y: number; rotation_z: number; scale_x: number; scale_y: number; scale_z: number
  opacity: number; visible: boolean; animation_type: string | null; action: string | null
  asset_url: string | null; asset_thumbnail: string | null; show_caption: boolean | null
  face_camera: boolean | null; chroma_key_color: string | null; chroma_key_tolerance: number | null
  chroma_key_smoothness: number | null; duration: number | null; scene_buttons: SceneButtonRow[]
}
type SceneRow = { id: string; name: string; background_color: string; created_at?: string; scene_objects: SceneObjectRow[] }
export type ExperienceProjectRow = {
  id: string; name: string; type: string; tracking_mode: "marker" | "surface" | "gps"
  latitude: number | null; longitude: number | null; activation_radius: number | null
  thumbnail_url: string | null; scenes: SceneRow[]
  project_markers: { image_url: string; target_url: string | null }[] | { image_url: string; target_url: string | null } | null
}

export function serializeExperience(project: ExperienceProjectRow): ArExperienceData {
  const scene = selectPrimaryScene(Array.isArray(project.scenes) ? project.scenes : [])
  const marker = Array.isArray(project.project_markers) ? project.project_markers[0] : project.project_markers
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    trackingMode: project.tracking_mode || "marker",
    latitude: project.latitude,
    longitude: project.longitude,
    activationRadius: project.activation_radius ?? 100,
    thumbnailUrl: project.thumbnail_url,
    marker: marker ? { imageUrl: marker.image_url, targetUrl: marker.target_url || null } : null,
    scene: scene ? {
      id: scene.id,
      name: scene.name,
      backgroundColor: scene.background_color,
      objects: (scene.scene_objects || []).map((obj) => ({
        id: obj.id,
        type: obj.type,
        name: obj.name,
        position: [obj.position_x, obj.position_y, obj.position_z] as [number, number, number],
        rotation: [obj.rotation_x, obj.rotation_y, obj.rotation_z] as [number, number, number],
        scale: [obj.scale_x, obj.scale_y, obj.scale_z] as [number, number, number],
        opacity: obj.opacity,
        visible: obj.visible,
        animationType: obj.animation_type || null,
        action: obj.action || null,
        assetUrl: obj.asset_url || null,
        assetThumbnail: obj.asset_thumbnail || null,
        showCaption: obj.show_caption || null,
        faceCamera: obj.face_camera ?? false,
        chromaKeyColor: obj.chroma_key_color || null,
        chromaKeyTolerance: obj.chroma_key_tolerance || null,
        chromaKeySmoothness: obj.chroma_key_smoothness || null,
        duration: obj.duration || null,
        buttons: (obj.scene_buttons || []).map((btn) => ({
          id: btn.id, label: btn.label, icon: btn.icon,
          actionType: btn.action_type, actionValue: btn.action_value,
        })),
      })),
    } : null,
  }
}
