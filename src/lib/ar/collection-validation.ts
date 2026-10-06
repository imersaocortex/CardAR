type Candidate = {
  id: string
  organization_id: string
  tracking_mode: string
  status: string
  latitude?: number | null
  longitude?: number | null
  project_markers?: { image_url: string | null }[] | { image_url: string | null } | null
}

export function validateCollectionMembers(
  mode: "marker" | "gps", organizationId: string, ids: string[], projects: Candidate[],
): string | null {
  if (ids.length < 2 || ids.length > (mode === "marker" ? 10 : 20) || new Set(ids).size !== ids.length)
    return "Escolha projetos diferentes dentro do limite permitido"
  const byId = new Map(projects.map((project) => [project.id, project]))
  for (const id of ids) {
    const project = byId.get(id)
    if (!project || project.organization_id !== organizationId || project.tracking_mode !== mode || project.status !== "published")
      return "Escolha somente projetos publicados da mesma organização e tecnologia"
    if (mode === "gps" && (project.latitude == null || project.longitude == null))
      return "Um projeto GPS não possui coordenadas"
    const markers = project.project_markers
    const marker = Array.isArray(markers) ? markers[0] : markers
    if (mode === "marker" && !marker?.image_url)
      return "Um projeto não possui imagem de marcador"
  }
  return null
}
