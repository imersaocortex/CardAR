type Subscription = {
  status: string
  current_period_end?: string | null
  trial_ends_at?: string | null
}

export type DashboardBillingNotice = {
  kind: "upcoming" | "expired" | "pending"
  title: string
  description: string
  action: string
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }).format(new Date(value))
}

export function dashboardBillingNotice(
  subscription: Subscription | null,
  superAdminOwned: boolean,
  now = Date.now(),
): DashboardBillingNotice | null {
  if (superAdminOwned) return null
  if (!subscription) return {
    kind: "expired", title: "Sua organização ainda não tem um plano ativo",
    description: "Escolha um plano para publicar e manter suas experiências disponíveis.",
    action: "Escolher plano",
  }

  const deadline = subscription.status === "trialing" ? subscription.trial_ends_at : subscription.current_period_end
  const end = deadline ? Date.parse(deadline) : NaN
  const expired = Number.isFinite(end) && end <= now

  if (subscription.status === "past_due" || subscription.status === "canceled" || expired) {
    const title = subscription.status === "canceled" ? "Sua assinatura foi cancelada"
      : subscription.status === "trialing" ? "Seu período de teste terminou" : "Seu plano venceu"
    const when = expired && deadline ? ` em ${dateLabel(deadline)}` : ""
    return {
      kind: "expired", title: `${title}${when}`,
      description: "A visualização pública dos seus projetos fica indisponível até a regularização. Seus projetos e arquivos continuam salvos.",
      action: "Regularizar assinatura",
    }
  }

  if (!["active", "trialing"].includes(subscription.status)) return {
    kind: "pending", title: "Pagamento da assinatura pendente",
    description: "O acesso às experiências será liberado após a confirmação do pagamento.",
    action: "Ver pagamento",
  }

  if (Number.isFinite(end) && end - now <= 7 * 24 * 60 * 60 * 1000) return {
    kind: "upcoming", title: `Seu ${subscription.status === "trialing" ? "período de teste" : "plano"} termina em ${dateLabel(deadline!)}`,
    description: "Acompanhe sua próxima cobrança para evitar a interrupção das experiências publicadas.",
    action: "Ver assinatura",
  }

  return null
}
