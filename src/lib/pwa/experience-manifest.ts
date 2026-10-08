import type { MetadataRoute } from "next"

export function experienceManifest(name: string, path: string): MetadataRoute.Manifest {
  return {
    id: path,
    name,
    short_name: name.slice(0, 24),
    description: `Experiência de realidade aumentada: ${name}`,
    start_url: path,
    scope: path,
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }
}

export function manifestResponse(name: string, path: string) {
  return new Response(JSON.stringify(experienceManifest(name, path)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" },
  })
}
