"use client"

import { create } from "zustand"
import { StudioElement, Layer, ProjectType } from "@/types"
import { mockElements, mockLayers } from "@/lib/mock-data"
import { createClient } from "@/lib/supabase/client"

export const projectTypeDimensions: Record<ProjectType, { width: number; height: number; label: string }> = {
  cartao: { width: 0.85, height: 0.55, label: "Cartão de Visita (88mm × 48mm)" },
  panfleto: { width: 2.1, height: 2.97, label: "Panfleto A4 (210mm × 297mm)" },
  post: { width: 1, height: 1, label: "Post 1×1 (formato quadrado)" },
}

interface StudioState {
  elements: StudioElement[]
  layers: Layer[]
  selectedElementId: string | null
  isPlaying: boolean
  isSaved: boolean
  isPreviewOpen: boolean
  projectType: ProjectType
  gizmoMode: "translate" | "rotate" | "scale"
  projectId: string | null
  sceneId: string | null
  setElements: (elements: StudioElement[]) => void
  setLayers: (layers: Layer[]) => void
  selectElement: (id: string | null) => void
  updateElement: (id: string, updates: Partial<StudioElement>) => void
  addElement: (element: StudioElement) => void
  removeElement: (id: string) => void
  reorderLayers: (layers: Layer[]) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  setPlaying: (playing: boolean) => void
  setSaved: (saved: boolean) => void
  setPreviewOpen: (open: boolean) => void
  setProjectType: (type: ProjectType) => void
  setGizmoMode: (mode: "translate" | "rotate" | "scale") => void
  setProjectId: (id: string | null) => void
  loadScene: (projectId: string) => Promise<void>
  saveScene: () => Promise<void>
  reset: () => void
}

export const useStudioStore = create<StudioState>((set, get) => ({
  elements: [],
  layers: [],
  selectedElementId: null,
  isPlaying: false,
  isSaved: true,
  isPreviewOpen: false,
  projectType: "cartao",
  gizmoMode: "translate",
  projectId: null,
  sceneId: null,

  setProjectId: (id) => set({ projectId: id }),

  loadScene: async (projectId: string) => {
    // Limpa o estado anterior para não exibir objetos de outro projeto
    set({ elements: [], layers: [], sceneId: null, projectId })

    try {
      const supabase = createClient()
      const { data: scenes } = await supabase
        .from("scenes")
        .select("*, scene_objects(*)")
        .eq("project_id", projectId)
        .order("created_at")
        .limit(1)

      if (scenes && scenes.length > 0) {
        const scene = scenes[0]
        const objects: StudioElement[] = (scene.scene_objects || []).map((obj: any) => ({
          id: obj.id,
          type: obj.type as any,
          name: obj.name,
          position: [obj.position_x, obj.position_y, obj.position_z] as [number, number, number],
          rotation: [obj.rotation_x, obj.rotation_y, obj.rotation_z] as [number, number, number],
          scale: [obj.scale_x, obj.scale_y, obj.scale_z] as [number, number, number],
          opacity: obj.opacity,
          duration: obj.duration || 0,
          visible: obj.visible,
          action: obj.action || undefined,
          assetUrl: obj.asset_url || undefined,
          assetThumbnail: obj.asset_thumbnail || undefined,
          showCaption: obj.show_caption ?? undefined,
          animationType: obj.animation_type as any || undefined,
          chromaKeyColor: obj.chroma_key_color || undefined,
          chromaKeyTolerance: obj.chroma_key_tolerance || undefined,
          chromaKeySmoothness: obj.chroma_key_smoothness || undefined,
        }))

        const layers: Layer[] = objects.map((obj, idx) => ({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          visible: obj.visible,
          locked: false,
          order: idx,
        }))

        set({
          elements: objects,
          layers,
          sceneId: scene.id,
          projectId,
        })
      }
    } catch {
      // Estado já foi limpo acima — mantém vazio
    }
  },

  saveScene: async () => {
    const { projectId, sceneId, elements } = get()
    if (!projectId) return

    const typeMap: Record<string, string> = {
      business_card: "cartao",
      flyer_a4: "panfleto",
      square_1x1: "post",
    }

    try {
      const supabase = createClient()

      if (!sceneId) {
        const { data: scene } = await supabase
          .from("scenes")
          .insert({ project_id: projectId, name: "Cena Principal" })
          .select()
          .single()

        if (scene) {
          set({ sceneId: scene.id })
          // Save scene objects
          for (const el of elements) {
            await supabase.from("scene_objects").insert({
              scene_id: scene.id,
              type: el.type,
              name: el.name,
              position_x: el.position[0],
              position_y: el.position[1],
              position_z: el.position[2],
              rotation_x: el.rotation[0],
              rotation_y: el.rotation[1],
              rotation_z: el.rotation[2],
              scale_x: el.scale[0],
              scale_y: el.scale[1],
              scale_z: el.scale[2],
              opacity: el.opacity,
              visible: el.visible,
              layer_order: elements.indexOf(el),
              animation_type: el.animationType ?? null,
              action: el.action ?? null,
              asset_url: el.assetUrl ?? null,
              asset_thumbnail: el.assetThumbnail ?? null,
              show_caption: el.showCaption ?? null,
              chroma_key_color: el.chromaKeyColor ?? null,
              chroma_key_tolerance: el.chromaKeyTolerance ?? null,
              chroma_key_smoothness: el.chromaKeySmoothness ?? null,
              duration: el.duration ?? null,
            })
          }
        }
      } else {
        // Update existing scene objects
        const { data: existing } = await supabase
          .from("scene_objects")
          .select("id")
          .eq("scene_id", sceneId)

        const existingIds = new Set((existing || []).map((e: any) => e.id))
        const currentIds = new Set(elements.map((e) => e.id))

        // Delete removed objects
        for (const eid of existingIds) {
          if (!currentIds.has(eid)) {
            await supabase.from("scene_objects").delete().eq("id", eid)
          }
        }

        // Upsert current objects
        for (const el of elements) {
          const payload = {
            scene_id: sceneId,
            type: el.type,
            name: el.name,
            position_x: el.position[0],
            position_y: el.position[1],
            position_z: el.position[2],
            rotation_x: el.rotation[0],
            rotation_y: el.rotation[1],
            rotation_z: el.rotation[2],
            scale_x: el.scale[0],
            scale_y: el.scale[1],
            scale_z: el.scale[2],
            opacity: el.opacity,
            visible: el.visible,
            layer_order: elements.indexOf(el),
            animation_type: el.animationType ?? null,
            action: el.action ?? null,
            asset_url: el.assetUrl ?? null,
            asset_thumbnail: el.assetThumbnail ?? null,
            show_caption: el.showCaption ?? null,
            chroma_key_color: el.chromaKeyColor || null,
            chroma_key_tolerance: el.chromaKeyTolerance || null,
            chroma_key_smoothness: el.chromaKeySmoothness || null,
            duration: el.duration || null,
          }

          if (existingIds.has(el.id)) {
            await supabase.from("scene_objects").update(payload).eq("id", el.id)
          } else {
            await supabase.from("scene_objects").insert(payload)
          }
        }
      }

      set({ isSaved: true })
    } catch {
      // Save failed silently
    }
  },

  setElements: (elements) => set({ elements }),
  setLayers: (layers) => set({ layers }),
  selectElement: (id) => set({ selectedElementId: id }),
  updateElement: (id, updates) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...updates } : el
      ),
      isSaved: false,
    })),
  addElement: (element) =>
    set((state) => ({
      elements: [...state.elements, element],
      layers: [
        ...state.layers,
        {
          id: element.id,
          name: element.name,
          type: element.type,
          visible: true,
          locked: false,
          order: state.layers.length,
        },
      ],
      isSaved: false,
    })),
  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      layers: state.layers.filter((l) => l.id !== id),
      selectedElementId:
        state.selectedElementId === id ? null : state.selectedElementId,
      isSaved: false,
    })),
  reorderLayers: (layers) => set({ layers, isSaved: false }),
  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, visible: !el.visible } : el
      ),
    })),
  toggleLayerLock: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, locked: !l.locked } : l
      ),
    })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setSaved: (saved) => set({ isSaved: saved }),
  setPreviewOpen: (open) => set({ isPreviewOpen: open }),
  setProjectType: (type) => set({ projectType: type }),
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
  reset: () =>
    set({
      elements: mockElements,
      layers: mockLayers,
      selectedElementId: null,
      isPlaying: false,
      isSaved: true,
      isPreviewOpen: false,
      projectType: "cartao",
      gizmoMode: "translate",
      projectId: null,
      sceneId: null,
    }),
}))
