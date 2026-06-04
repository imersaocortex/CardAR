export const PLANS = {
  starter: {
    id: "starter" as const,
    name: "Starter",
    price: 49,
    projectsLimit: 3,
    assetsLimitBytes: 500 * 1024 * 1024,
    assetsLimitLabel: "500 MB",
    features: [
      "3 projetos ativos",
      "500MB de assets",
      "Modelos 3D básicos",
      "Vídeos MP4",
      "QR Code",
      "Marca d'água AR Business",
    ],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    price: 97,
    projectsLimit: 25,
    assetsLimitBytes: 5 * 1024 * 1024 * 1024,
    assetsLimitLabel: "5 GB",
    features: [
      "25 projetos ativos",
      "5GB de assets",
      "Modelos 3D animados",
      "Vídeos MP4 + Chromakey",
      "Botões interativos",
      "QR Code personalizado",
      "Sem marca d'água",
      "Suporte prioritário",
    ],
  },
  agency: {
    id: "agency" as const,
    name: "Agency",
    price: 197,
    projectsLimit: Infinity,
    assetsLimitBytes: 50 * 1024 * 1024 * 1024,
    assetsLimitLabel: "50 GB",
    features: [
      "Projetos ilimitados",
      "50GB de assets",
      "Todos os recursos Pro",
      "Múltiplos usuários",
      "API de integração",
      "Domínio próprio",
      "Analytics avançado",
      "Suporte 24h",
    ],
  },
} as const

export type PlanId = keyof typeof PLANS

export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "model/gltf-binary",
  "model/gltf+json",
  "video/mp4",
] as const

export const STORAGE_BUCKETS = {
  MARKERS: "markers",
  MODELS_3D: "models-3d",
  VIDEOS: "videos",
  THUMBNAILS: "thumbnails",
  EXPORTS: "exports",
  PUBLIC_PREVIEWS: "public-previews",
} as const

export const PROJECT_TYPES = ["business_card", "flyer_a4", "square_1x1"] as const
export const PROJECT_STATUSES = ["draft", "published", "paused", "archived"] as const
export const ORG_ROLES = ["owner", "admin", "editor", "viewer"] as const
