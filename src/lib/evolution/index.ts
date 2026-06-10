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
    const { data } = await admin
      .from("system_settings")
      .select("evolution")
      .eq("id", 1)
      .single()

    if (!data?.evolution) return null

    const config = data.evolution as Record<string, any>
    if (!config.enabled || !config.server_url || !config.api_key || !config.instance_name) {
      return null
    }

    return {
      server_url: config.server_url.replace(/\/+$/, ""),
      api_key: config.api_key,
      instance_name: config.instance_name,
      enabled: true,
    }
  } catch {
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

  const text = `✅ *Pagamento Confirmado - AR Business Studio*\n\n` +
    `Olá! Recebemos o pagamento do plano *${planName}* no valor de *R$ ${(value / 100).toFixed(2)}*.\n\n` +
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
