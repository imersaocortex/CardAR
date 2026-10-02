// A plane's front points along local +Z. Keep its horizontal front aimed at the viewer.
export function yawTowardViewer(objectX: number, objectZ: number, viewerX: number, viewerZ: number): number | null {
  const dx = viewerX - objectX
  const dz = viewerZ - objectZ
  return dx * dx + dz * dz < 1e-8 ? null : Math.atan2(dx, dz)
}
