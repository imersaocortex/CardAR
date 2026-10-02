export function playSpatialVideoMuted(media: HTMLMediaElement[]) {
  return Promise.allSettled(media.filter((element) => element.tagName === "VIDEO").map((element) => element.play()))
}

export async function enableSpatialAudio(media: HTMLMediaElement[]) {
  // Calls to play() must be initiated in the click handler's user activation.
  const attempts = media.map((element) => {
    element.muted = false
    return element.play()
  })
  const results = await Promise.allSettled(attempts)
  results.forEach((result, index) => { if (result.status === "rejected") media[index].muted = true })
  return results.some((result) => result.status === "fulfilled")
}

export function muteSpatialAudio(media: HTMLMediaElement[]) {
  media.forEach((element) => {
    element.muted = true
    if (element.tagName === "AUDIO") element.pause()
  })
}
