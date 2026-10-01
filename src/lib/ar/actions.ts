export function getActionUrl(action: string): string | null {
  const value = action.trim()
  if (/^https?:\/\//i.test(value)) {
    try { return new URL(value).href } catch { return null }
  }
  const separator = value.indexOf(":")
  if (separator < 0) return null
  const type = value.slice(0, separator).toLowerCase()
  const target = value.slice(separator + 1).trim()
  if (type === "url" || type === "link") return /^https?:\/\//i.test(target) ? getActionUrl(target) : null
  if (type === "whatsapp") { const phone = target.replace(/\D/g, ""); return phone ? `https://wa.me/${phone}` : null }
  if (type === "instagram") { const handle = target.replace(/^@/, ""); return /^[\w.]+$/.test(handle) ? `https://instagram.com/${handle}` : null }
  if (type === "phone" || type === "tel") return /^[+\d ()-]+$/.test(target) ? `tel:${target.replace(/[ ()-]/g, "")}` : null
  if (type === "email" || type === "mailto") return /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(target) ? `mailto:${target}` : null
  return null
}
