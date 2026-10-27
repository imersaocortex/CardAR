export function planFeatureLabels(plan: {
  features: string[]
  has_watermark?: boolean
  multi_project_enabled?: boolean
  gps_enabled?: boolean
  surface_enabled?: boolean
}) {
  const labels = [...(plan.features ?? [])]
  const normalized = labels.join(" ").toLocaleLowerCase("pt-BR")
  if (plan.multi_project_enabled && !normalized.includes("vários projetos") && !normalized.includes("multi projeto"))
    labels.push("Vários projetos em uma URL")
  if (plan.gps_enabled && !normalized.includes("gps")) labels.push("Experiências por GPS")
  if (plan.surface_enabled && !normalized.includes("superfície") && !normalized.includes("sem marcador"))
    labels.push("AR sem marcador em superfícies")
  if (plan.has_watermark === false && !normalized.includes("sem marca") && !normalized.includes("remover marca"))
    labels.push("Sem marca d’água nas experiências")
  return labels
}
