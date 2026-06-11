interface EvolutionConfig {
  server_url: string
  api_key: string
  instance_name: string
  enabled: boolean
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
      .select("evolution")
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

    console.log("[Evolution] Config carregada:", { server_url: config.server_url, instance_name: config.instance_name, enabled: config.enabled })

    return {
      server_url: config.server_url.replace(/\/+$/, ""),
      api_key: config.api_key,
      instance_name: config.instance_name,
      enabled: true,
    }
  } catch (err) {
    console.error("[Evolution] Erro ao carregar config:", err)
    return null
  }
}

async function sendMessage(config: EvolutionConfig, number: string, text: string): Promise<boolean> {
  try {
    const formattedNumber = number.replace(/\D/g, "")
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
  const text = `✅ *Pagamento Confirmado - AR Business Studio*\n\n` +
    `Olá! Recebemos o pagamento do plano *${planName}* no valor de *R$ ${formattedValue}*.\n\n` +
    `Sua assinatura está ativa e todos os recursos já estão liberados.\n\n` +
    `Obrigado por escolher a AR Business Studio! 🚀`

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
  const text = `⚠️ *Fatura Vencida - AR Business Studio*\n\n` +
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

  const text = `🔔 *Aviso Importante - AR Business Studio*\n\n${message}`

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
  const text = `🔔 *Lembrete de Cobrança - AR Business Studio*\n\n` +
    `Olá! Sua fatura do plano *${planName}* no valor de *R$ ${formattedValue}* ` +
    `vence no dia *${formattedDate}*.\n\n` +
    `Mantenha seu plano ativo para continuar usando todos os recursos.\n\n` +
    `Para mais detalhes, acesse o painel da AR Business Studio.`

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
