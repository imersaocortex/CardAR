const RADIUS = 6371000
const rad = (degrees: number) => degrees * Math.PI / 180

export function geoOffset(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const phi1 = rad(latitude), phi2 = rad(targetLatitude)
  const dPhi = phi2 - phi1, dLambda = rad(targetLongitude - longitude)
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  const distance = 2 * RADIUS * Math.atan2(Math.sqrt(Math.min(a, 1)), Math.sqrt(Math.max(0, 1 - a)))
  const bearing = Math.atan2(Math.sin(dLambda) * Math.cos(phi2), Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda))
  return { distance, bearing: (bearing * 180 / Math.PI + 360) % 360, east: distance * Math.sin(bearing), north: distance * Math.cos(bearing) }
}

// Keep the AR model at a readable visual distance. Geographic distance is used
// for guidance, not as the model's distance from the camera.
export function gpsDisplayPosition(offset: { distance: number; bearing: number }, accuracy: number) {
  const atTarget = offset.distance <= Math.max(3, Math.min(accuracy, 20))
  const angle = rad(offset.bearing)
  const visualDistance = 6
  return { atTarget, east: visualDistance * Math.sin(angle), north: visualDistance * Math.cos(angle) }
}

export function bearingDifference(targetBearing: number, cameraHeading: number) {
  return ((targetBearing - cameraHeading + 540) % 360) - 180
}
