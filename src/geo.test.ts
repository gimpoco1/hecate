import { describe, expect, it } from 'vitest'
import { discoveryCellCenter, discoveryCellsFromPoints, distanceKm, isUsableGpsPoint, mergeRoutePoints, metersToPixels, pointToDiscoveryCell, routeDistanceKm, shouldRecordPoint, splitRoute } from './geo'

describe('discovery route geometry', () => {
  const a = { lng: 2.17, lat: 41.38, recordedAt: 1_000, accuracy: 5 }
  const b = { lng: 2.171, lat: 41.38, recordedAt: 20_000, accuracy: 5 }

  it('calculates real-world path distance', () => {
    expect(distanceKm(a, b)).toBeGreaterThan(0.08)
    expect(routeDistanceKm([a, b])).toBeCloseTo(distanceKm(a, b))
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

  it('does not merge a local walk with its simplified server copy', () => {
    const local = [{ ...a, walkId: 'walk-1' }, { ...b, walkId: 'walk-1' }]
    const remote = [
      { ...a, walkId: 'walk-1', accuracy: undefined },
      { ...b, walkId: 'walk-1', accuracy: undefined },
    ]
    expect(mergeRoutePoints(local, remote)).toEqual(local)
  })

  it('keeps a fixed ground reveal radius across zoom levels', () => {
    const atZoom14 = metersToPixels(120, 41.38, 14)
    const atZoom15 = metersToPixels(120, 41.38, 15)
    expect(atZoom15).toBeCloseTo(atZoom14 * 2)
    expect(atZoom15).toBeGreaterThan(60)
    expect(atZoom15).toBeLessThan(70)
  })
})
