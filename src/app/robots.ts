import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/assets", "/billing", "/dashboard", "/login", "/profile", "/projects", "/affiliates", "/experience", "/r/"] },
    sitemap: "https://www.cortexar.space/sitemap.xml",
    host: "https://www.cortexar.space",
  }
}
