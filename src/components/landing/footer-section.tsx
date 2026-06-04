"use client"

import { Zap } from "lucide-react"
import Link from "next/link"

const footerLinks = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como Funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
]

export function FooterSection() {
  return (
    <footer className="border-t border-border py-12 px-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm">
              AR <span className="text-gradient">Business</span>
            </span>
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
            &copy; 2026 AR Business Studio. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
