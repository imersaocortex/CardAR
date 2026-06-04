"use client"

import { useEffect } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { useAuthStore } from "@/store/auth-store"

export function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  )
}
