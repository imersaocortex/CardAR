import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export async function generateMetadata(): Promise<Metadata> {
  await cookies()
  const admin = createAdminClient()
  const { data } = await admin
    .from("system_settings")
    .select("branding")
    .eq("id", 1)
    .maybeSingle()

  const branding = (data?.branding as Record<string, any>) || {}
  const siteName = branding.site_name || "AR Business Studio"
  const metaTitle = branding.meta_title || `${siteName} - Realidade Aumentada para Negócios`
  const metaDescription = branding.meta_description || "Crie experiências de realidade aumentada para cartões de visita, panfletos e materiais impressos."
  const ogImageUrl = branding.og_image_url || null
  const faviconUrl = branding.favicon_url || null

  return {
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      siteName,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: ogImageUrl ? [ogImageUrl] : [],
    },
    icons: faviconUrl ? [{ rel: "icon", url: faviconUrl }] : [],
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
