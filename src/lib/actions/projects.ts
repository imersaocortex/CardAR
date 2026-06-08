"use server"

import { revalidatePath } from "next/cache"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createProjectSchema, updateProjectSchema } from "@/lib/schemas"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let slug = ""
  for (let i = 0; i < 10; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return slug
}

export async function getProjects() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)

  if (!memberships?.length) return []

  const orgIds = memberships.map(m => m.organization_id)

  const { data } = await supabase
    .from("projects")
    .select("*")
    .in("organization_id", orgIds)
    .order("updated_at", { ascending: false })

  return data || []
}

export async function getProject(id: string) {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single()

  return data
}

export async function createProject(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "editor"])
    .limit(1)

  if (!memberships?.length) return { error: "Sem permissão" }

  const orgId = memberships[0].organization_id

  const raw = {
    name: formData.get("name") as string,
    type: formData.get("type") as string,
  }

  const parsed = createProjectSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const admin = createAdminClient()

  // Check subscription status
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("organization_id", orgId)
    .single()

  if (sub) {
    const trialExpired = sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()
    if (sub.status === "past_due") {
      return { error: "Assinatura vencida. Regularize o pagamento para criar projetos." }
    }
    if (sub.status === "canceled") {
      return { error: "Assinatura cancelada. Escolha um plano para criar projetos." }
    }
    if (sub.status === "pending") {
      return { error: "Assinatura pendente de pagamento. Acesse a página de cobrança para pagar." }
    }
    if (sub.status === "trialing" && trialExpired) {
      return { error: "Período de teste expirado. Assine um plano para continuar." }
    }
  }

  const { data: limitOk } = await admin.rpc("check_project_limit", {
    p_organization_id: orgId,
  })

  if (limitOk === false) {
    return { error: "Limite de projetos atingido. Faça upgrade do plano." }
  }

  const slug = generateSlug()

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: orgId,
      name: parsed.data.name,
      type: parsed.data.type,
      slug,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Increment project usage
  const { data: usage } = await admin
    .from("usage_limits")
    .select("projects_used")
    .eq("organization_id", orgId)
    .single()

  if (usage) {
    await admin
      .from("usage_limits")
      .update({ projects_used: (usage.projects_used || 0) + 1 })
      .eq("organization_id", orgId)
  }

  revalidatePath("/projects")
  return { data }
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createServerSupabaseClient()

  const raw: Record<string, string> = {}
  formData.forEach((value, key) => { raw[key] = value as string })

  const parsed = updateProjectSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/projects")
  return { success: true }
}

export async function deleteProject(id: string) {
  const supabase = await createServerSupabaseClient()
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", id)
    .single()

  if (!project) return { error: "Projeto não encontrado" }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)

  if (error) return { error: error.message }

  // Decrement project usage
  const admin = createAdminClient()
  const { data: usage } = await admin
    .from("usage_limits")
    .select("projects_used")
    .eq("organization_id", project.organization_id)
    .single()

  if (usage) {
    await admin
      .from("usage_limits")
      .update({ projects_used: Math.max(0, (usage.projects_used || 0) - 1) })
      .eq("organization_id", project.organization_id)
  }

  revalidatePath("/projects")
  return { success: true }
}

export async function publishProject(id: string) {
  return updateProject(id, createFormData({ status: "published" }))
}

function createFormData(obj: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(obj).forEach(([k, v]) => fd.append(k, v))
  return fd
}
