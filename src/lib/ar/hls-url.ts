export function isPublicHlsUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && url.pathname.toLowerCase().endsWith(".m3u8")
  } catch {
    return false
  }
}
