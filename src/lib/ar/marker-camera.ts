type MarkerVideo = Pick<HTMLVideoElement, "videoWidth" | "videoHeight" | "width" | "height">

export function syncMarkerVideoDimensions(
  video: MarkerVideo,
  inputWidth: number,
  inputHeight: number,
): "unavailable" | "same" | "rotated" | "reinitialize" {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return "unavailable"

  if (width === inputWidth && height === inputHeight) {
    video.width = width
    video.height = height
    return "same"
  }

  if (width === inputHeight && height === inputWidth) {
    // MindAR rotates swapped video dimensions into the original tracking canvas.
    video.width = width
    video.height = height
    return "rotated"
  }

  return "reinitialize"
}
