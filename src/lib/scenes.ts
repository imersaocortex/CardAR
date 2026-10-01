/** Keep the editor and public player on the same scene for legacy projects. */
export function selectPrimaryScene<T extends { id: string; created_at?: string; scene_objects?: unknown[] }>(scenes: T[]): T | null {
  return [...scenes].sort((a, b) =>
    (b.scene_objects?.length ?? 0) - (a.scene_objects?.length ?? 0) ||
    (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id),
  )[0] ?? null
}
