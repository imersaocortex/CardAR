"use client"

import { useState, useEffect } from "react"
import { Zap } from "lucide-react"
import Link from "next/link"

interface Branding {
  site_name?: string
  logo_url?: string | null
  footer_text?: string | null
}

const footerLinks = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como Funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
]

export function FooterSection() {
  const [branding, setBranding] = useState<Branding | null>(null)

  useEffect(() => {
    fetch("/api/public/settings")
      .then((res) => res.json())
      .then((data) => setBranding(data.branding))
      .catch(() => {})
  }, [])

  const siteName = branding?.site_name || "AR Business Studio"
  const logoUrl = branding?.logo_url
  const footerText = branding?.footer_text

  return (
    <footer className="border-t border-border py-12 px-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="h-8 w-auto" />
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary">
                <Zap className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="font-bold text-sm">{siteName}</span>
          </Link>

          <div className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {footerText || `© 2026 ${siteName}. Todos os direitos reservados.`}
          </p>
        </div>
      </div>
    </footer>
  )
}
