"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  FolderKanban,
  Box,
  CreditCard,
  User,
  Zap,
  Shield,
  Link2,
  MessageCircle,
  ArrowUpRight,
  Images,
} from "lucide-react"
import { useAuthStore } from "@/store/auth-store"
import styles from "./app-sidebar.module.css"

interface Branding {
  site_name?: string
  logo_url?: string | null
}

export function AppSidebar() {
  const pathname = usePathname()
  const { isPlatformAdmin: storeIsAdmin } = useAuthStore()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [branding, setBranding] = useState<Branding | null>(null)

  useEffect(() => {
    fetch("/api/public/settings")
      .then((res) => res.json())
      .then((data) => setBranding(data.branding))
      .catch(() => {})
  }, [])

  const siteName = branding?.site_name || "CortexAR"
  const logoUrl = branding?.logo_url

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch("/api/admin/check")
        if (res.ok) {
          const data = await res.json()
          setIsAdmin(data.isAdmin)
          return
        }
      } catch {}
      setIsAdmin(storeIsAdmin)
    }
    checkAdmin()
  }, [storeIsAdmin])

  const showAdmin = isAdmin ?? storeIsAdmin

  const routes = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Projetos", href: "/projects", icon: FolderKanban },
    { label: "Assets", href: "/assets", icon: Box },
    { label: "Sliders", href: "/sliders", icon: Images },
    { label: "Faturamento", href: "/billing", icon: CreditCard },
    { label: "Perfil", href: "/profile", icon: User },
    { label: "Indicações", href: "/affiliates", icon: Link2 },
    ...(showAdmin ? [{ label: "Administrador", href: "/admin", icon: Shield }] : []),
  ]

  return (
    <aside className={`${styles.panel} fixed inset-y-3 left-3 z-50 hidden w-[calc(16rem-1.5rem)] flex-col lg:flex`}>
      <div className={`${styles.brand} flex h-16 shrink-0 items-center gap-3 px-4`}>
        {logoUrl ? (
          <img src={logoUrl} alt={siteName} className="h-9 w-auto max-w-full object-contain" />
        ) : (
          <>
            <div className={`${styles.emblem} grid size-9 shrink-0 place-items-center rounded-xl`}>
              <Zap className="size-4" aria-hidden="true" />
            </div>
            <span className="truncate text-sm font-semibold tracking-wide">{siteName}</span>
          </>
        )}
      </div>

      <nav aria-label="Menu principal" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {routes.map((route) => {
          const Icon = route.icon
          const current = pathname === route.href ? "page" : pathname.startsWith(`${route.href}/`) ? "location" : undefined

          return (
            <Link
              key={route.href}
              href={route.href}
              aria-current={current}
              className={`${styles.link} flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium`}
            >
              <Icon className={`${styles.icon} size-[1.125rem] shrink-0`} aria-hidden="true" />
              {route.label}
            </Link>
          )
        })}
      </nav>
      <footer className={`${styles.footer} shrink-0 px-3 py-3`}>
        <a
          href="https://wa.me/5581989077025"
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.support} flex min-h-12 items-center gap-2.5 rounded-xl px-2.5 text-sm font-semibold`}
        >
          <span className={`${styles.supportIcon} grid size-7 shrink-0 place-items-center rounded-lg`}>
            <MessageCircle className="size-4" aria-hidden="true" />
          </span>
          <span className="flex-1">Suporte via WhatsApp</span>
          <ArrowUpRight className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
        </a>
        <a
          href="https://imersaocortex.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.credit} mt-1 flex min-h-8 items-center justify-center rounded-md text-center text-xs`}
        >
          Desenvolvimento: Imersão Córtex
        </a>
      </footer>
    </aside>
  )
}
