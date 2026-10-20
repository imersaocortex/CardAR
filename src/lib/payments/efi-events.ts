export function parseEfiWebhookEvents(body: unknown) {
  if (!body || typeof body !== "object") return { txids: [] as string[], recurrenceIds: [] as string[], endToEndIds: [] as string[] }
  const payload = body as Record<string, unknown>
  const txids = new Set<string>()
  const recurrenceIds = new Set<string>()
  const endToEndIds = new Set<string>()
  for (const key of ["pix", "cobsr", "cobr"]) {
    const entries = payload[key]
    if (!Array.isArray(entries)) continue
    for (const item of entries.slice(0, 100)) {
      if (item && typeof item === "object" && typeof item.txid === "string" && /^[a-zA-Z0-9]{26,35}$/.test(item.txid)) txids.add(item.txid)
      if (key === "pix" && item && typeof item === "object" && item.status !== "NAO_REALIZADO" && typeof item.endToEndId === "string" && /^[a-zA-Z0-9]{25,40}$/.test(item.endToEndId)) endToEndIds.add(item.endToEndId)
    }
  }
  const recs = payload.recs
  if (Array.isArray(recs)) {
    for (const item of recs.slice(0, 100)) {
      if (item && typeof item === "object" && typeof item.idRec === "string" && /^[a-zA-Z0-9]{20,40}$/.test(item.idRec)) recurrenceIds.add(item.idRec)
    }
  }
  return { txids: [...txids], recurrenceIds: [...recurrenceIds], endToEndIds: [...endToEndIds] }
}
