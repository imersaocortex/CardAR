"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  Palette,
  Package,
  DollarSign,
  Users,
  Settings,
  BarChart3,
  MessageSquare,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AppShell } from "@/components/layout/app-shell"
import { useAuthStore } from "@/store/auth-store"
import { createClient } from "@/lib/supabase/client"
import { DashboardTab } from "./tabs/dashboard-tab"
import { BrandingTab } from "./tabs/branding-tab"
import { PlansTab } from "./tabs/plans-tab"
import { FinancesTab } from "./tabs/finances-tab"
import { CustomersTab } from "./tabs/customers-tab"
import { AsaasTab } from "./tabs/asaas-tab"
import { AnalyticsTab } from "./tabs/analytics-tab"
import { EvolutionTab } from "./tabs/evolution-tab"

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { id: "branding", label: "Identidade Visual", icon: Palette, adminOnly: false },
  { id: "plans", label: "Planos", icon: Package, adminOnly: false },
  { id: "finances", label: "Financeiro", icon: DollarSign, adminOnly: false },
  { id: "customers", label: "Clientes", icon: Users, adminOnly: false },
  { id: "asaas", label: "ASAAS", icon: Settings, adminOnly: true },
  { id: "evolution", label: "Evolution API", icon: MessageSquare, adminOnly: true },
  { id: "analytics", label: "Estatísticas", icon: BarChart3, adminOnly: false },
]

export default function AdminSettingsPage() {
  const router = useRouter()
  const { isLoading: authLoading, profile, logout } = useAuthStore()
  const [activeTab, setActiveTab] = useState("dashboard")
  const [data, setData] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const [statsRes, settingsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/settings"),
      ])

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setData(statsData)
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        setSettings(settingsData)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return

    async function init() {
      const supabase = createClient()
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) {
        router.replace("/login")
        return
      }

      const res = await fetch("/api/admin/check")
      if (res.ok) {
        const { isAdmin: admin, role } = await res.json()
        if (!admin) {
          router.replace("/dashboard")
          return
        }
        setIsAdmin(true)
        setUserRole(role)
      } else {
        router.replace("/dashboard")
        return
      }

      await loadData()
    }
    init()
  }, [authLoading, router])

  if (authLoading || loading || isAdmin === null) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    )
  }

  if (!data) return null

  const canAccessAsaas = userRole === "super_admin"

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Configurações do Sistema</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie todos os aspectos da plataforma AR Business Studio
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-56 shrink-0">
            <ScrollArea className="h-full max-h-[calc(100vh-12rem)]">
              <nav className="space-y-1">
                {TABS.filter((t) => !t.adminOnly || canAccessAsaas).map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  )
                })}
              </nav>

              <div className="mt-6 p-3 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Logado como <strong className="text-foreground">{profile?.name}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Role: <span className="uppercase text-primary font-medium text-[10px]">
                    {userRole === "super_admin" ? "Super Admin" : userRole}
                  </span>
                </p>
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 min-w-0">
            {activeTab === "dashboard" && <DashboardTab data={data} />}
            {activeTab === "branding" && (
              <BrandingTab settings={settings} onSaved={loadData} />
            )}
            {activeTab === "plans" && <PlansTab />}
            {activeTab === "finances" && <FinancesTab />}
            {activeTab === "customers" && <CustomersTab />}
            {activeTab === "asaas" && canAccessAsaas && (
              <AsaasTab settings={settings} onSaved={loadData} />
            )}
            {activeTab === "evolution" && canAccessAsaas && (
              <EvolutionTab settings={settings} onSaved={loadData} />
            )}
            {activeTab === "analytics" && <AnalyticsTab />}
          </div>
        </div>
      </motion.div>
    </AppShell>
  )
}
