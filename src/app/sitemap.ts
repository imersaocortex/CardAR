import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://www.cortexar.space/", changeFrequency: "monthly", priority: 1 }]
}
