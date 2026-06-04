"use client"

import { create } from "zustand"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface OrgInfo {
  id: string
  name: string
  slug: string
  role: string
}

interface ProfileInfo {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: string
}

interface AuthState {
  user: User | null
  profile: ProfileInfo | null
  organization: OrgInfo | null
  isLoading: boolean
  isAuthenticated: boolean
  isPlatformAdmin: boolean
  initialize: () => Promise<void>
  setUser: (user: User | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  organization: null,
  isLoading: true,
  isAuthenticated: false,
  isPlatformAdmin: false,

  initialize: async () => {
    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ user: null, profile: null, organization: null, isLoading: false, isAuthenticated: false, isPlatformAdmin: false })
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations!inner(id, name, slug)")
        .eq("user_id", user.id)
        .limit(1)

      const org = memberships?.[0]
        ? {
            id: (memberships[0] as any).organizations.id,
            name: (memberships[0] as any).organizations.name,
            slug: (memberships[0] as any).organizations.slug,
            role: memberships[0].role,
          }
        : null

      set({
        user,
        profile,
        organization: org,
        isLoading: false,
        isAuthenticated: true,
        isPlatformAdmin: profile?.role === "super_admin" || profile?.role === "admin",
      })
    } catch {
      set({ user: null, profile: null, organization: null, isLoading: false, isAuthenticated: false, isPlatformAdmin: false })
    }
  },

  setUser: (user) =>
    set({ user, isAuthenticated: !!user }),

  logout: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, profile: null, organization: null, isAuthenticated: false, isPlatformAdmin: false })
  },
}))
