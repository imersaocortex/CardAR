import { geoOffset, gpsDisplayPosition, isGpsWithinRadius } from "./geo"

export type GpsProject = { id: string; name: string; latitude?: number | null; longitude?: number | null; activationRadius?: number }
export type GpsPoint = { id: string; name: string; index: number; distance: number; bearing: number; radius: number; inRange: boolean; atTarget: boolean; east: number; north: number }

export function locateGpsProjects(projects: GpsProject[], coords: { latitude: number; longitude: number; accuracy: number }, lastBearings: (number | null)[]): GpsPoint[] {
  return projects.flatMap((project, index) => {
    if (!Number.isFinite(project.latitude) || !Number.isFinite(project.longitude)) return []
    const offset = geoOffset(coords.latitude, coords.longitude, project.latitude!, project.longitude!)
    const placement = gpsDisplayPosition(offset, coords.accuracy, lastBearings[index])
    if (!placement.atTarget) lastBearings[index] = offset.bearing
    const radius = project.activationRadius ?? 100
    return [{ id: project.id, name: project.name, index, ...offset, ...placement, radius, inRange: isGpsWithinRadius(offset.distance, radius) }]
  })
}

export function gpsRadarPosition(point: { distance: number; bearing: number }, heading: number, range: number) {
  const angle = (point.bearing - heading) * Math.PI / 180
  const radius = Math.min(1, Math.max(0, point.distance / Math.max(1, range))) * 40
  return { x: 50 + Math.sin(angle) * radius, y: 50 - Math.cos(angle) * radius, beyondRange: point.distance > range }
}

// A slow/broken asset must not hold every other project in the collection.
// Late results after timeout or closing the camera are always disposed.
export async function loadGpsScenes<T extends { dispose: () => void }>(count: number, load: (index: number) => Promise<T>, options: {
  signal: AbortSignal; loaded: (index: number, content: T) => void; failed: (index: number) => void; timeoutMs?: number
}) {
  let next = 0
  const worker = async () => {
    while (next < count && !options.signal.aborted) {
      const index = next++
      await new Promise<void>((resolve) => {
        let finished = false
        const finish = () => { finished = true; clearTimeout(timer); options.signal.removeEventListener("abort", abort); resolve() }
        const abort = () => finish()
        const timer = setTimeout(() => { options.failed(index); finish() }, options.timeoutMs ?? 30000)
        options.signal.addEventListener("abort", abort, { once: true })
        void Promise.resolve().then(() => load(index)).then((content) => {
          if (finished || options.signal.aborted) { content.dispose(); return }
          options.loaded(index, content)
          finish()
        }, () => { if (!finished) { if (!options.signal.aborted) options.failed(index); finish() } })
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, count) }, worker))
}
