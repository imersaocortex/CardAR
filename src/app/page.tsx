import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import LandingPageClient from "@/components/landing/landing-page-client"
import type { Plan } from "@/components/landing/plans-section"
import { billingAvailability } from "@/lib/payments/settings"

const url = "https://www.cortexar.space/"
const fallbackDescription = "Crie experiências de realidade aumentada com marcador, GPS ou detecção de superfícies. Publique modelos 3D, vídeos e streaming HLS em links acessíveis pelo navegador."

async function branding() {
  const { data } = await createAdminClient().from("system_settings").select("branding").eq("id", 1).maybeSingle()
  return (data?.branding || {}) as { site_name?: string; meta_title?: string; meta_description?: string }
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await branding()
  const siteName = brand.site_name || "CortexAR"
  const title = brand.meta_title && !/realidade aumentada para negócios/i.test(brand.meta_title)
    ? brand.meta_title : `${siteName} | Plataforma de realidade aumentada com GPS, WebAR e vídeo`
  const description = brand.meta_description && /GPS|superfície|streaming|HLS/i.test(brand.meta_description)
    ? brand.meta_description : fallbackDescription
  const image = `${url}cortexar-share-v4.jpg`
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, type: "website", url, siteName, locale: "pt_BR",
      images: [{ url: image, secureUrl: image, type: "image/jpeg", width: 1200, height: 630,
        alt: `${siteName}: criação de experiências de realidade aumentada` }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function HomePage() {
  const [brand, plansResult, availability] = await Promise.all([
    branding(),
    createAdminClient().from("plans").select("*").eq("active", true).order("price"),
    billingAvailability().catch(() => null),
  ])
  const plans = ((plansResult.data || []) as Plan[]).map((plan) => ({ ...plan, billing_cycle: plan.billing_cycle || "monthly" }))
  const siteName = brand.site_name || "CortexAR"
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${url}#organization`, name: siteName, url },
      { "@type": "WebSite", "@id": `${url}#website`, name: siteName, url, inLanguage: "pt-BR",
        publisher: { "@id": `${url}#organization` } },
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: `${siteName} | Plataforma de realidade aumentada`,
        description: fallbackDescription, inLanguage: "pt-BR", isPartOf: { "@id": `${url}#website` } },
      { "@type": "SoftwareApplication", "@id": `${url}#software`, name: siteName, url,
        applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "pt-BR",
        description: fallbackDescription, publisher: { "@id": `${url}#organization` } },
    ],
  }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }} />
    <LandingPageClient plans={plans} billingEnabled={!!(availability?.asaas.configured || availability?.mercado_pago.configured)} />
  </>
}
