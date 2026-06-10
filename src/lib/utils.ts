import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateSlug(length = 10): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let slug = ""
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return slug
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function mapProjectType(type: string): string {
  const map: Record<string, string> = {
    business_card: "cartao",
    flyer_a4: "panfleto",
    square_1x1: "post",
    cartao: "business_card",
    panfleto: "flyer_a4",
    post: "square_1x1",
  }
  return map[type] || type
}

export function mapProjectStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "rascunho",
    published: "publicado",
    paused: "pausado",
    archived: "arquivado",
    suspended: "suspenso",
    rascunho: "draft",
    publicado: "published",
    pausado: "paused",
    arquivado: "archived",
    suspenso: "suspended",
  }
  return map[status] || status
}
