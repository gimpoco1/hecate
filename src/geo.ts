import type { Coordinate } from './types'

const EARTH_RADIUS_KM = 6371

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

export function splitRoute(points: Coordinate[]) {
  return points.reduce<Coordinate[][]>((segments, point) => {
    const segment = segments.at(-1)
    const previous = segment?.at(-1)
    const isNewJourney = previous && (
      point.recordedAt - previous.recordedAt > 2 * 60 * 60 * 1000 || distanceKm(previous, point) > 5
    )
    if (!segment || isNewJourney) segments.push([point])
    else segment.push(point)
    return segments
  }, [])
}

export function shouldRecordPoint(previous: Coordinate | undefined, next: Coordinate) {
  if (!previous) return true
  if ((next.accuracy ?? 0) > 80) return false
  return distanceKm(previous, next) >= 0.008 || next.recordedAt - previous.recordedAt >= 12_000
}

export const BARCELONA_DEMO_ROUTE: Coordinate[] = [
  [2.1491, 41.3748], [2.1511, 41.3758], [2.1532, 41.3769], [2.1551, 41.3782],
  [2.1571, 41.3798], [2.1592, 41.3810], [2.1614, 41.3822], [2.1634, 41.3837],
  [2.1654, 41.3851], [2.1677, 41.3862], [2.1699, 41.3874], [2.1720, 41.3887],
].map(([lng, lat], index) => ({ lng, lat, recordedAt: Date.now() - (12 - index) * 60_000 }))
