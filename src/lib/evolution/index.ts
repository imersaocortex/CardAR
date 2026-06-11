interface EvolutionConfig {
  server_url: string
  api_key: string
  instance_name: string
  enabled: boolean
  site_name: string
}

interface EvolutionMessage {
  number: string
  text: string
  delay?: number
}

async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("system_settings")
      .select("evolution, branding")
      .eq("id", 1)
      .single()

    if (error) {
      console.error("[Evolution] Erro ao buscar config:", error.message)
      return null
    }

    if (!data?.evolution) {
      console.warn("[Evolution] Nenhuma config encontrada em system_settings")
      return null
    }

    const config = data.evolution as Record<string, any>
    const branding = data.branding as Record<string, any> | undefined

    if (!config.enabled) {
      console.warn("[Evolution] Evolution API está desabilitada nas configurações")
      return null
    }

    if (!config.server_url) {
      console.warn("[Evolution] server_url não configurado")
      return null
    }

    if (!config.api_key) {
      console.warn("[Evolution] api_key não configurada")
      return null
    }

    if (!config.instance_name) {
      console.warn("[Evolution] instance_name não configurado")
      return null
    }

    const site_name = branding?.site_name || "AR Business Studio"
    console.log("[Evolution] Config carregada:", { server_url: config.server_url, instance_name: config.instance_name, enabled: config.enabled, site_name })

    return {
      server_url: config.server_url.replace(/\/+$/, ""),
      api_key: config.api_key,
      instance_name: config.instance_name,
      enabled: true,
      site_name,
    }
  } catch (err) {
    console.error("[Evolution] Erro ao carregar config:", err)
    return null
  }
}

function normalizePhone(number: string): string {
  const digits = number.replace(/\D/g, "")
  if (digits.length < 10) return digits
  // If number has 10-11 digits (Brazilian mobile/landline without country code), add 55
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return "55" + digits
  }
  return digits
}

async function sendMessage(config: EvolutionConfig, number: string, text: string): Promise<boolean> {
  try {
    const formattedNumber = normalizePhone(number)
    if (formattedNumber.length < 10) return false

    const response = await fetch(
      `${config.server_url}/message/sendText/${config.instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.api_key,
        },
        body: JSON.stringify({
          number: formattedNumber,
          text,
          delay: 1000,
        } satisfies EvolutionMessage),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      console.error("[Evolution API] Error sending message:", text)
      return false
    }

    return true
  } catch (err) {
    console.error("[Evolution API] Error:", err)
    return false
  }
}

async function getOrgPhone(organizationId: string): Promise<string | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "owner")
      .limit(1)
      .single()

    if (!member) return null

    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", member.user_id)
      .single()

    return profile?.phone || null
  } catch {
    return null
  }
}

export async function sendPaymentSuccessNotification(
  organizationId: string,
  planName: string,
  value: number,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  const formattedValue = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const text = `✅ *Pagamento Confirmado - ${config.site_name}*\n\n` +
    `Olá! Recebemos o pagamento do plano *${planName}* no valor de *R$ ${formattedValue}*.\n\n` +
    `Sua assinatura está ativa e todos os recursos já estão liberados.\n\n` +
    `Obrigado por escolher a ${config.site_name}! 🚀`

  return sendMessage(config, phone, text)
}

export async function sendOverdueNotification(
  organizationId: string,
  planName: string,
  dueDate: string,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  const formattedDate = new Date(dueDate).toLocaleDateString("pt-BR")
  const text = `⚠️ *Fatura Vencida - ${config.site_name}*\n\n` +
    `Olá! A fatura do plano *${planName}* com vencimento em *${formattedDate}* está vencida.\n\n` +
    `Seus projetos foram temporariamente desabilitados até a regularização.\n\n` +
    `Acesse o painel e efetue o pagamento para reativar seus projetos.`

  return sendMessage(config, phone, text)
}

export async function sendSystemWarningNotification(
  organizationId: string,
  message: string,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  const text = `🔔 *Aviso Importante - ${config.site_name}*\n\n${message}`

  return sendMessage(config, phone, text)
}

export async function sendUpcomingPaymentNotification(
  organizationId: string,
  planName: string,
  value: number,
  dueDate: string,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  const formattedDate = new Date(dueDate).toLocaleDateString("pt-BR")
  const formattedValue = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const text = `🔔 *Lembrete de Cobrança - ${config.site_name}*\n\n` +
    `Olá! Sua fatura do plano *${planName}* no valor de *R$ ${formattedValue}* ` +
    `vence no dia *${formattedDate}*.\n\n` +
    `Mantenha seu plano ativo para continuar usando todos os recursos.\n\n` +
    `Para mais detalhes, acesse o painel da ${config.site_name}.`

  return sendMessage(config, phone, text)
}

export async function sendPlanChangeNotification(
  organizationId: string,
  oldPlanName: string,
  newPlanName: string,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  const text = `🔄 *Alteração de Plano - ${config.site_name}*\n\n` +
    `Olá! Seu plano foi alterado com sucesso.\n\n` +
    `*Plano anterior:* ${oldPlanName}\n` +
    `*Novo plano:* ${newPlanName}\n\n` +
    `Aproveite todos os recursos do seu novo plano! 🚀`

  return sendMessage(config, phone, text)
}

export async function sendSubscriptionCanceledNotification(
  organizationId: string,
  planName: string,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  const text = `❌ *Assinatura Cancelada - ${config.site_name}*\n\n` +
    `Olá! Sua assinatura do plano *${planName}* foi cancelada.\n\n` +
    `Seus projetos foram desabilitados. Seu plano agora é o Starter.\n\n` +
    `Caso queira reativar, acesse o painel e escolha um novo plano.`

  return sendMessage(config, phone, text)
}

export async function sendCustomMessage(
  organizationId: string,
  text: string,
): Promise<boolean> {
  const config = await getEvolutionConfig()
  if (!config) return false

  const phone = await getOrgPhone(organizationId)
  if (!phone) return false

  return sendMessage(config, phone, text)
}
