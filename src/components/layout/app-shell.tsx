"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AppSidebar } from "./app-sidebar"
import { DashboardHeader } from "./dashboard-header"
import { useAuthStore } from "@/store/auth-store"
import { createClient } from "@/lib/supabase/client"
import { AlertTriangle, Crown, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "none"

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuthStore()
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>("none")
  const [dismissed, setDismissed] = useState(false)
  const [trialDaysLeft, setTrialDaysLeft] = useState(0)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login")
    }
  }, [isAuthenticated, isLoading, router])

  useEffect(() => {
    if (!isAuthenticated) return

    async function checkSubscription() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()

      if (!membership) {
        setSubStatus("none")
        return
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*, plans!inner(slug, name)")
        .eq("organization_id", membership.organization_id)
        .single()

      if (!sub) {
        setSubStatus("none")
        return
      }

      if (sub.status === "active") {
        setSubStatus("active")
      } else if (sub.status === "trialing") {
        setSubStatus("trialing")
        if (sub.trial_ends_at) {
          const end = new Date(sub.trial_ends_at)
          const now = new Date()
          const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          setTrialDaysLeft(Math.max(0, diff))
        }
      } else if (sub.status === "past_due") {
        setSubStatus("past_due")
      } else {
        setSubStatus("canceled")
      }
    }

    checkSubscription()
  }, [isAuthenticated])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  const showBanner = !dismissed && subStatus !== "active"

  return (
    <div className="min-h-screen bg-background">
      {showBanner && (
        <div className="relative z-50 px-4 py-2 bg-gradient-to-r from-primary/10 via-primary/5 to-secondary/10 border-b border-primary/20">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              {subStatus === "trialing" && (
                <>
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>
                    Período de teste: <strong>{trialDaysLeft} dias</strong> restantes.
                    Assine um plano para continuar usando todos os recursos.
                  </span>
                </>
              )}
              {subStatus === "past_due" && (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>
                    Sua assinatura está vencida. Regularize o pagamento para continuar usando a plataforma.
                  </span>
                </>
              )}
              {subStatus === "canceled" && (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>
                    Sua assinatura foi cancelada. Escolha um plano para reativar seus projetos.
                  </span>
                </>
              )}
              {subStatus === "none" && (
                <>
                  <Crown className="h-4 w-4 text-amber-400" />
                  <span>
                    Você está no plano <strong>Starter</strong>. Assine um plano para criar projetos ilimitados.
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="gradient" size="sm" asChild>
                <Link href="/billing">Ver Planos</Link>
              </Button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded-full hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <AppSidebar />
      <div className="lg:pl-64">
        <DashboardHeader />
        <main className={showBanner ? "p-6 pt-24 lg:pt-28" : "p-6 pt-20 lg:pt-24"}>
          {children}
        </main>
      </div>
    </div>
  )
}
