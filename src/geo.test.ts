import { describe, expect, it } from 'vitest'
import { discoveredAreaKm2, discoveredCellDistanceKm, discoveredDistanceKm, discoveryCellCenter, discoveryCellsFromPoints, discoveryJourneyMetricsByRegion, distanceKm, isUsableGpsPoint, mergeRoutePoints, metersToPixels, pointToDiscoveryCell, routeDistanceKm, shouldRecordPoint, splitRoute } from './geo'

describe('discovery route geometry', () => {
  const a = { lng: 2.17, lat: 41.38, recordedAt: 1_000, accuracy: 5 }
  const b = { lng: 2.171, lat: 41.38, recordedAt: 20_000, accuracy: 5 }

  it('calculates real-world path distance', () => {
    expect(distanceKm(a, b)).toBeGreaterThan(0.08)
    expect(routeDistanceKm([a, b])).toBeCloseTo(distanceKm(a, b))
  })

  it('counts distance only when a route reaches a new discovery cell', () => {
    const returnToStart = { ...a, recordedAt: 40_000 }
    const repeatStreet = { ...b, recordedAt: 60_000 }
    const distance = discoveredDistanceKm([a, b, returnToStart, repeatStreet])
    expect(distance).toBeGreaterThan(.05)
    expect(distance).toBeLessThanOrEqual(distanceKm(a, b))
  })

  it('calculates new-ground distance from the persistent cell history', () => {
    const cells = discoveryCellsFromPoints([a, b])
    expect(discoveredCellDistanceKm(cells)).toBeGreaterThan(.05)
  })

  it('attributes each new-ground sample to the region where it was unlocked', () => {
    const metrics = discoveryJourneyMetricsByRegion(
      [a, b, { ...b, lng: 2.172, recordedAt: 40_000 }],
      point => point.lng < 2.1715 ? 'west' : 'east',
    )
    const attributed = metrics[0].newGroundKmByRegion ?? {}

    expect(attributed.west).toBeGreaterThan(0)
    expect(attributed.east).toBeGreaterThan(0)
    expect((attributed.west ?? 0) + (attributed.east ?? 0))
      .toBeCloseTo(metrics[0].newGroundKm)
  })

  it('does not add new-way distance for a repeated discovery cell', () => {
    const cell = pointToDiscoveryCell(a)
    expect(discoveredCellDistanceKm([cell, { ...cell, discoveredAt: 2_000 }]))
      .toBe(discoveredCellDistanceKm([cell]))
  })

  it('drops noisy GPS positions', () => {
    expect(shouldRecordPoint(a, { ...b, accuracy: 120 })).toBe(false)
    expect(isUsableGpsPoint({ ...b, accuracy: 120 })).toBe(false)
  })

  it('keeps movement at any speed but drops stationary drift', () => {
    expect(shouldRecordPoint(a, b)).toBe(true)
    expect(shouldRecordPoint(a, { ...a, recordedAt: 14_000 })).toBe(false)
    expect(shouldRecordPoint(a, { ...b, lng: 2.18, recordedAt: 2_000 })).toBe(true)
    expect(shouldRecordPoint(undefined, { ...a, accuracy: 60 })).toBe(false)
  })

  it('does not connect separate journeys with a teleport line', () => {
    const farAway = { lng: -0.12, lat: 51.5, recordedAt: 20_000, accuracy: 5 }
    expect(splitRoute([a, b, farAway])).toHaveLength(2)
    expect(routeDistanceKm([a, b, farAway])).toBeCloseTo(distanceKm(a, b))
  })

  it('does not connect separate explicit walk sessions', () => {
    expect(splitRoute([{ ...a, walkId: 'one' }, { ...b, walkId: 'two' }])).toHaveLength(2)
  })

  it('deduplicates repeated visits to the same discovery cell', () => {
    const nearby = { ...a, recordedAt: 2_000, lng: a.lng + 0.000001 }
    const cells = discoveryCellsFromPoints([a, nearby])
    expect(cells).toHaveLength(1)
    const [lng, lat] = discoveryCellCenter(pointToDiscoveryCell(a))
    expect(Math.abs(lng - a.lng)).toBeLessThan(0.0001)
    expect(Math.abs(lat - a.lat)).toBeLessThan(0.0001)
  })

  it('does not add revealed area for a repeated discovery cell', () => {
    const cell = pointToDiscoveryCell(a)
    expect(discoveredAreaKm2([cell, { ...cell, discoveredAt: 2_000 }]))
      .toBe(discoveredAreaKm2([cell]))
  })

  it('uses the persisted server walk instead of a stale local copy', () => {
    const local = [{ ...a, walkId: 'walk-1' }, { ...b, walkId: 'walk-1' }]
    const remote = [
      { ...a, recordedAt: 1_500, walkId: 'walk-1', accuracy: undefined },
      { ...b, recordedAt: 2_500, walkId: 'walk-1', accuracy: undefined },
    ]
    expect(mergeRoutePoints(local, remote)).toEqual(remote)
  })

  it('keeps local walks that have not reached the server yet', () => {
    const pending = [{ ...a, walkId: 'pending-walk' }, { ...b, walkId: 'pending-walk' }]
    const remote = [{ ...a, walkId: 'saved-walk', accuracy: undefined }]

    expect(mergeRoutePoints(pending, remote)).toEqual([
      pending[0],
      remote[0],
      pending[1],
    ])
  })

  it('preserves complete walk segments when synced and pending timestamps overlap', () => {
    const pending = [
      { ...a, recordedAt: 1_000, walkId: 'pending-walk' },
      { ...b, recordedAt: 20_000, walkId: 'pending-walk' },
    ]
    const savedStart = { ...a, lat: 41.39, recordedAt: 5_000, walkId: 'saved-walk', accuracy: undefined }
    const savedEnd = { ...b, lat: 41.39, recordedAt: 15_000, walkId: 'saved-walk', accuracy: undefined }
    const merged = mergeRoutePoints(pending, [savedStart, savedEnd])
    const segments = splitRoute(merged)

    expect(segments.map(segment => segment.map(point => point.walkId))).toEqual([
      ['pending-walk', 'pending-walk'],
      ['saved-walk', 'saved-walk'],
    ])
    expect(routeDistanceKm(merged)).toBeCloseTo(
      distanceKm(pending[0], pending[1]) + distanceKm(savedStart, savedEnd),
    )
  })

  it('keeps a fixed ground reveal radius across zoom levels', () => {
    const atZoom14 = metersToPixels(120, 41.38, 14)
    const atZoom15 = metersToPixels(120, 41.38, 15)
    expect(atZoom15).toBeCloseTo(atZoom14 * 2)
    expect(atZoom15).toBeGreaterThan(60)
    expect(atZoom15).toBeLessThan(70)
  })

  it('keeps the reveal radius finite at polar latitudes', () => {
    const mercatorLimit = metersToPixels(120, 85.05112878, 15)

    expect(metersToPixels(120, 90, 15)).toBeCloseTo(mercatorLimit)
    expect(metersToPixels(120, -90, 15)).toBeCloseTo(mercatorLimit)
    expect(mercatorLimit).toBeLessThan(Number.POSITIVE_INFINITY)
  })
})
