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
  Settings,
  Shield,
  Link2,
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
    { label: "Faturamento", href: "/billing", icon: CreditCard },
    { label: "Perfil", href: "/profile", icon: User },
    { label: "Indicações", href: "/affiliates", icon: Link2 },
    ...(showAdmin
      ? [
          { label: "Administrador", href: "/admin", icon: Shield },
          { label: "Configurações", href: "/admin", icon: Settings },
        ]
      : []),
  ]

  const activeRoute = routes.findIndex(({ href }) => pathname === href || pathname.startsWith(`${href}/`))

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
        {routes.map((route, i) => {
          const Icon = route.icon

          return (
            <Link
              key={`${route.href}-${i}`}
              href={route.href}
              aria-current={activeRoute === i ? (pathname === route.href ? "page" : "location") : undefined}
              className={`${styles.link} flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium`}
            >
              <Icon className={`${styles.icon} size-[1.125rem] shrink-0`} aria-hidden="true" />
              {route.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
