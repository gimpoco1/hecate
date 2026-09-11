import { describe, expect, it } from 'vitest'
import { distanceKm, routeDistanceKm, shouldRecordPoint, splitRoute } from './geo'

describe('discovery route geometry', () => {
  const a = { lng: 2.17, lat: 41.38, recordedAt: 1_000, accuracy: 5 }
  const b = { lng: 2.171, lat: 41.38, recordedAt: 2_000, accuracy: 5 }

  it('calculates real-world path distance', () => {
    expect(distanceKm(a, b)).toBeGreaterThan(0.08)
    expect(routeDistanceKm([a, b])).toBeCloseTo(distanceKm(a, b))
  })

  it('drops noisy GPS positions', () => {
    expect(shouldRecordPoint(a, { ...b, accuracy: 120 })).toBe(false)
  })

  it('keeps movement and periodic stationary samples', () => {
    expect(shouldRecordPoint(a, b)).toBe(true)
    expect(shouldRecordPoint(a, { ...a, recordedAt: 14_000 })).toBe(true)
  })

  it('does not connect separate journeys with a teleport line', () => {
    const farAway = { lng: -0.12, lat: 51.5, recordedAt: 20_000, accuracy: 5 }
    expect(splitRoute([a, b, farAway])).toHaveLength(2)
    expect(routeDistanceKm([a, b, farAway])).toBeCloseTo(distanceKm(a, b))
  })
})
