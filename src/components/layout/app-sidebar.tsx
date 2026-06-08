"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FolderKanban,
  Box,
  CreditCard,
  User,
  Zap,
  Settings,
  Shield,
} from "lucide-react"
import { useAuthStore } from "@/store/auth-store"

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

  const siteName = branding?.site_name || "AR Business Studio"
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
    ...(showAdmin
      ? [
          { label: "Administrador", href: "/admin", icon: Shield },
          { label: "Configurações", href: "/admin", icon: Settings },
        ]
      : []),
  ]

  return (
    <aside className="fixed left-0 top-0 z-50 h-screen w-64 border-r border-border/40 bg-background hidden lg:flex flex-col">
      <div className="flex items-center gap-2 h-16 px-6 border-b border-border/40">
        {logoUrl ? (
          <img src={logoUrl} alt={siteName} className="h-8 w-auto" />
        ) : (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary">
            <Zap className="h-4 w-4 text-white" />
          </div>
        )}
        <span className="font-bold">{siteName}</span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {routes.map((route, i) => {
          const Icon = route.icon
          const isActive = pathname === route.href

          return (
            <Link
              key={`${route.href}-${i}`}
              href={route.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4" />
              {route.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
