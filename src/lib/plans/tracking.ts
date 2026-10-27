export type TrackingMode = "marker" | "surface" | "gps"

export function planAllowsTrackingMode(
  plan: { gps_enabled?: boolean | null; surface_enabled?: boolean | null } | null | undefined,
  mode: TrackingMode,
) {
  if (mode === "gps") return plan?.gps_enabled === true
  if (mode === "surface") return plan?.surface_enabled === true
  return true
}
