// Scene units shared by the studio and the spatial players.
export const VIDEO_PLANE_SIZE = [1.5, 0.85] as const
export const BUTTON_PLANE_SIZE = [0.5, 0.5] as const
export const BUTTON_CAPTION_SIZE = [0.6, 0.15] as const
export const BUTTON_CAPTION_Y = -0.36

export function imagePlaneSize(width: number, height: number): [number, number] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [1.5, 1.5]
  return [1.5, 1.5 * height / width]
}
