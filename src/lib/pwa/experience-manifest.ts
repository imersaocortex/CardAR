import type { MetadataRoute } from "next"

export function experienceManifest(name: string, path: string, origin: string): MetadataRoute.Manifest {
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
      { src: "/pwa-favicon-v2-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-favicon-v2-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    related_applications: [{
      platform: "webapp",
      url: `${origin}${path}/manifest.webmanifest`,
      id: `${origin}${path}`,
    }],
  }
}

export function manifestResponse(name: string, path: string, origin: string) {
  return new Response(JSON.stringify(experienceManifest(name, path, origin)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" },
  })
}
