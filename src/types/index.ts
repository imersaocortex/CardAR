export type ProjectType = "cartao" | "panfleto" | "post"
export type ProjectStatus = "rascunho" | "publicado" | "pausado"

export interface Project {
  id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  thumbnail: string
  views: number
  createdAt: string
  updatedAt: string
}

export type ElementType =
  | "modelo-3d"
  | "modelo-3d-animado"
  | "video-mp4"
  | "video-chromakey"
  | "imagem"
  | "audio"
  | "botao-whatsapp"
  | "botao-site"
  | "botao-instagram"
  | "botao-ligar"
  | "botao-email"

export type AnimationType = "none" | "float" | "rotate" | "pulse" | "embedded"

export interface StudioElement {
  id: string
  type: ElementType
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  opacity: number
  duration: number
  visible: boolean
  action?: string
  assetUrl?: string
  assetThumbnail?: string
  showCaption?: boolean
  animationType?: AnimationType
  hasEmbeddedAnimations?: boolean
  chromaKeyColor?: string
  chromaKeyTolerance?: number
  chromaKeySmoothness?: number
}

export interface Layer {
  id: string
  name: string
  type: ElementType
  visible: boolean
  locked: boolean
  order: number
}

export type AssetCategory = "3d" | "video" | "image"

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  size: string
  url: string
  createdAt: string
  thumbnail?: string
}

export type PlanType = "starter" | "pro" | "agency"

export interface Plan {
  id: PlanType
  name: string
  price: string
  projectsLimit: number | "ilimitado"
  assetsLimit: string
  features: string[]
}

export interface Metric {
  label: string
  value: string
  change: string
  icon: string
}

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  plan: PlanType
}

export interface AdminUser {
  id: string
  name: string
  email: string
  plan: PlanType
  projects: number
  createdAt: string
  status: "ativo" | "inativo"
}

export interface Payment {
  id: string
  user: string
  plan: PlanType
  amount: string
  date: string
  status: "aprovado" | "pendente" | "recusado"
}

export type ProjectFilter = "todos" | ProjectType
