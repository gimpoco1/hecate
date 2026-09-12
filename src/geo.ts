import type { Coordinate, DiscoveryCell } from './types'

const EARTH_RADIUS_KM = 6371
const WEB_MERCATOR_CIRCUMFERENCE_M = 2 * Math.PI * 6378137
const MAP_TILE_SIZE = 512
const MAX_GPS_ACCURACY_M = 35
export const DISCOVERY_CELL_ZOOM = 20
export const DISCOVERY_RADIUS_M = 35

export function distanceKm(a: Coordinate, b: Coordinate) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function routeDistanceKm(points: Coordinate[]) {
  return splitRoute(points).reduce((total, segment) => (
    total + segment.slice(1).reduce((subtotal, point, index) => subtotal + distanceKm(segment[index], point), 0)
  ), 0)
}

export function mergeRoutePoints(local: Coordinate[], remote: Coordinate[] = []) {
  const combined = [...local, ...remote]
  const walksWithDetailedPoints = new Set(
    combined.filter(point => point.walkId && point.accuracy !== undefined).map(point => point.walkId!),
  )
  const unique = new Map<string, Coordinate>()

  combined.forEach(point => {
    // A server route is a simplified copy of a locally recorded walk. Keeping
    // both copies interleaves their timestamps and approximately doubles its distance.
    if (point.walkId && point.accuracy === undefined && walksWithDetailedPoints.has(point.walkId)) return
    const key = `${point.walkId ?? ''}:${point.recordedAt}:${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`
    unique.set(key, point)
  })

  return [...unique.values()].sort((a, b) => a.recordedAt - b.recordedAt)
}

export function splitRoute(points: Coordinate[]) {
  return points.reduce<Coordinate[][]>((segments, point) => {
    const segment = segments.at(-1)
    const previous = segment?.at(-1)
    const isNewJourney = previous && (
      Boolean((previous.walkId || point.walkId) && previous.walkId !== point.walkId) ||
      point.recordedAt - previous.recordedAt > 2 * 60 * 60 * 1000 || distanceKm(previous, point) > 5
    )
    if (!segment || isNewJourney) segments.push([point])
    else segment.push(point)
    return segments
  }, [])
}

export function pointToDiscoveryCell(point: Coordinate, z = DISCOVERY_CELL_ZOOM): DiscoveryCell {
  const scale = 2 ** z
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat))
  const latitudeRadians = latitude * Math.PI / 180
  return {
    z,
    x: Math.floor(((point.lng + 180) / 360) * scale),
    y: Math.floor((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale),
    discoveredAt: point.recordedAt,
  }
}

export function discoveryCellCenter(cell: DiscoveryCell): [number, number] {
  const scale = 2 ** cell.z
  const lng = (cell.x + 0.5) / scale * 360 - 180
  const mercatorY = Math.PI * (1 - 2 * (cell.y + 0.5) / scale)
  const lat = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI
  return [lng, lat]
}

export function mergeDiscoveryCells(...collections: DiscoveryCell[][]) {
  const unique = new Map<string, DiscoveryCell>()
  collections.flat().forEach(cell => {
    const key = `${cell.z}/${cell.x}/${cell.y}`
    const existing = unique.get(key)
    if (!existing || cell.discoveredAt < existing.discoveredAt) unique.set(key, cell)
  })
  return [...unique.values()]
}

export function discoveryCellsFromPoints(points: Coordinate[]) {
  return mergeDiscoveryCells(points.map(point => pointToDiscoveryCell(point)))
}

export function isUsableGpsPoint(next: Coordinate) {
  if (!Number.isFinite(next.lng) || !Number.isFinite(next.lat) || !Number.isFinite(next.recordedAt)) return false
  if ((next.accuracy ?? 0) > MAX_GPS_ACCURACY_M) return false
  return true
}

export function shouldRecordPoint(previous: Coordinate | undefined, next: Coordinate) {
  if (!isUsableGpsPoint(next)) return false
  if (!previous) return true

  const elapsedSeconds = (next.recordedAt - previous.recordedAt) / 1000
  if (elapsedSeconds <= 0) return false
  const distanceM = distanceKm(previous, next) * 1000

  // Movement smaller than the GPS uncertainty is usually stationary drift.
  const uncertaintyM = Math.max(previous.accuracy ?? 0, next.accuracy ?? 0)
  const minimumMovementM = Math.max(8, Math.min(20, uncertaintyM * 0.5))
  return distanceM >= minimumMovementM
}

export function metersToPixels(meters: number, latitude: number, zoom: number) {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  const metersPerPixel = Math.cos(clampedLatitude * Math.PI / 180)
    * WEB_MERCATOR_CIRCUMFERENCE_M / (MAP_TILE_SIZE * 2 ** zoom)
  return meters / metersPerPixel
}
