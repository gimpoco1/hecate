import type { Coordinate, DiscoveryCell } from './types'

const EARTH_RADIUS_KM = 6371
const WEB_MERCATOR_CIRCUMFERENCE_M = 2 * Math.PI * 6378137
const MAP_TILE_SIZE = 512
const MAX_GPS_ACCURACY_M = 35
export const DISCOVERY_CELL_ZOOM = 20
export const DISCOVERY_RADIUS_M = 35
const DISCOVERY_DISTANCE_SAMPLE_M = DISCOVERY_RADIUS_M

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

/**
 * Distance that resulted in new discoveries. Returning through a cell that
 * has already been unlocked is still part of the route, but does not add to
 * this metric.
 */
export function discoveredDistanceKm(points: Coordinate[]) {
  return discoveredDistanceForFootprints(points, point => discoveryFootprintCells(pointToDiscoveryCell(point)))
}

/**
 * Credits a route only for portions that add new discovery cells. Sampling at
 * the same 35 m interval as the reveal radius prevents sub-cell GPS noise
 * from inflating the distance while avoiding a sparse update crediting an
 * entire already-known street.
 */
export function discoveredDistanceForFootprints(
  points: Coordinate[],
  footprintForPoint: (point: Coordinate) => DiscoveryCell[],
) {
  return discoveryJourneyMetricsForFootprints(points, footprintForPoint)
    .reduce((total, journey) => total + journey.newGroundKm, 0)
}

export type DiscoveryJourneyMetric = {
  journeyId: string
  points: Coordinate[]
  startedAt: number
  finishedAt: number
  travelledKm: number
  newGroundKm: number
}

function discoveryJourneyMetricsForFootprints(
  points: Coordinate[],
  footprintForPoint: (point: Coordinate) => DiscoveryCell[],
) {
  const revealed = new Set<string>()
  const metrics = new Map<string, DiscoveryJourneyMetric>()

  for (const [segmentIndex, segment] of splitRoute(points).entries()) {
    const firstPoint = segment[0]
    if (!firstPoint) continue
    const journeyId = firstPoint.walkId ?? `journey-${segmentIndex}`
    let newGroundKm = 0
    let travelledKm = 0
    footprintForPoint(firstPoint).forEach(cell => revealed.add(discoveryCellKey(cell)))
    let distanceSinceLastUnlockKm = 0

    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1]
      const point = segment[index]
      const segmentDistance = distanceKm(previous, point)
      travelledKm += segmentDistance
      const steps = Math.max(1, Math.ceil(segmentDistance * 1_000 / DISCOVERY_DISTANCE_SAMPLE_M))
      const stepDistance = segmentDistance / steps

      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps
        const sample: Coordinate = {
          lng: previous.lng + (point.lng - previous.lng) * progress,
          lat: previous.lat + (point.lat - previous.lat) * progress,
          recordedAt: previous.recordedAt + (point.recordedAt - previous.recordedAt) * progress,
        }
        const footprint = footprintForPoint(sample)
        const unlocksNewGround = footprint.some(cell => !revealed.has(discoveryCellKey(cell)))
        distanceSinceLastUnlockKm += stepDistance
        if (unlocksNewGround) {
          // A cell unlock represents the last small stretch of newly revealed
          // ground. Cap the credit at the reveal radius so a sparse GPS jump
          // cannot claim a long, already-known street before its endpoint.
          newGroundKm += Math.min(distanceSinceLastUnlockKm, DISCOVERY_RADIUS_M / 1_000)
          distanceSinceLastUnlockKm = 0
        }
        footprint.forEach(cell => revealed.add(discoveryCellKey(cell)))
      }
    }

    const existing = metrics.get(journeyId)
    metrics.set(journeyId, existing ? {
      ...existing,
      points: [...existing.points, ...segment],
      startedAt: Math.min(existing.startedAt, firstPoint.recordedAt),
      finishedAt: Math.max(existing.finishedAt, segment.at(-1)?.recordedAt ?? firstPoint.recordedAt),
      travelledKm: existing.travelledKm + travelledKm,
      newGroundKm: existing.newGroundKm + newGroundKm,
    } : {
      journeyId,
      points: segment,
      startedAt: firstPoint.recordedAt,
      finishedAt: segment.at(-1)?.recordedAt ?? firstPoint.recordedAt,
      travelledKm,
      newGroundKm,
    })
  }
  return [...metrics.values()]
}

/** Per-recording totals using the same new-ground algorithm as the main map. */
export function discoveryJourneyMetrics(points: Coordinate[]) {
  return discoveryJourneyMetricsForFootprints(
    points,
    point => discoveryFootprintCells(pointToDiscoveryCell(point)),
  )
}

/**
 * Converts the persistent discovery history into an ordered, approximate path.
 * Discovery cells are the cross-device source of truth, unlike a route geometry
 * which may be absent on an older device or have been simplified by a server.
 */
export function discoveryPointsFromCells(cells: DiscoveryCell[]): Coordinate[] {
  return [...cells]
    .sort((a, b) => a.discoveredAt - b.discoveredAt)
    .map(cell => {
      const [lng, lat] = discoveryCellCenter(cell)
      return { lng, lat, recordedAt: cell.discoveredAt }
    })
}

/**
 * Distance of the newly discovered way, reconstructed from the ordered
 * `discovery_cells` history. The cells are the persisted cross-device source
 * of truth; the sampler credits only movement that unlocks a fresh cell.
 */
export function discoveredCellDistanceKm(cells: DiscoveryCell[]) {
  return discoveredDistanceForFootprints(
    discoveryPointsFromCells(cells),
    point => discoveryFootprintCells(pointToDiscoveryCell(point)),
  )
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

export function discoveryCellCenter(cell: Pick<DiscoveryCell, 'z' | 'x' | 'y'>): [number, number] {
  const scale = 2 ** cell.z
  const lng = (cell.x + 0.5) / scale * 360 - 180
  const mercatorY = Math.PI * (1 - 2 * (cell.y + 0.5) / scale)
  const lat = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI
  return [lng, lat]
}

export function discoveryCellKey(cell: Pick<DiscoveryCell, 'z' | 'x' | 'y'>) {
  return `${cell.z}/${cell.x}/${cell.y}`
}

/** The zoom-20 cells covered by a point's fixed 35 m reveal radius. */
export function discoveryFootprintCells(cell: DiscoveryCell) {
  const [, latitude] = discoveryCellCenter(cell)
  const cellSizeM = WEB_MERCATOR_CIRCUMFERENCE_M * Math.cos(latitude * Math.PI / 180) / 2 ** cell.z
  const range = Math.ceil(DISCOVERY_RADIUS_M / cellSizeM)
  const footprint: DiscoveryCell[] = []

  for (let offsetX = -range; offsetX <= range; offsetX += 1) {
    for (let offsetY = -range; offsetY <= range; offsetY += 1) {
      if (Math.hypot(offsetX, offsetY) * cellSizeM > DISCOVERY_RADIUS_M + cellSizeM * .72) continue
      footprint.push({ ...cell, x: cell.x + offsetX, y: cell.y + offsetY })
    }
  }
  return footprint
}

export function discoveryCellAreaKm2(cell: Pick<DiscoveryCell, 'z' | 'x' | 'y'>) {
  const [, latitude] = discoveryCellCenter(cell)
  const cellSizeM = WEB_MERCATOR_CIRCUMFERENCE_M * Math.cos(latitude * Math.PI / 180) / 2 ** cell.z
  return cellSizeM * cellSizeM / 1_000_000
}

/** The de-duplicated physical area revealed by all discovery footprints. */
export function discoveredAreaKm2(cells: DiscoveryCell[]) {
  const revealed = new Map<string, DiscoveryCell>()
  for (const cell of cells) {
    for (const candidate of discoveryFootprintCells(cell)) {
      revealed.set(discoveryCellKey(candidate), candidate)
    }
  }
  return [...revealed.values()].reduce((total, cell) => total + discoveryCellAreaKm2(cell), 0)
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
