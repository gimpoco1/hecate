import { describe, expect, it } from 'vitest'
import { distanceKm, discoveryCellKey, pointToDiscoveryCell } from './geo'
import { InactivityReminder, INACTIVITY_REMINDER_MINUTES, INACTIVITY_RADIUS_M, isPreviouslyDiscovered } from './inactivityReminder'
import type { Coordinate } from './types'

const start: Coordinate = { lat: 41.387, lng: 2.17, accuracy: 8, recordedAt: 1_000 }
const knownCells = new Set([discoveryCellKey(pointToDiscoveryCell(start))])
const nearby = (meters: number, now: number): Coordinate => ({
  ...start,
  lng: start.lng + meters / 83_000,
  recordedAt: now,
})

describe('active recording inactivity reminder', () => {
  it('waits 15 minutes inside 150 m of a previously discovered spot', () => {
    const detector = new InactivityReminder()
    const due = detector.observe(start, true, 1_000)
    expect(due).toBe(1_000 + INACTIVITY_REMINDER_MINUTES * 60_000)
    expect(distanceKm(start, nearby(140, 2_000)) * 1_000).toBeLessThan(INACTIVITY_RADIUS_M)
    expect(detector.observe(nearby(140, 2_000), true, 2_000)).toBe(due)
    detector.markReminded()
    expect(detector.observe(start, true, due! + 1)).toBeNull()
  })

  it('restarts when leaving the radius or entering new ground', () => {
    const detector = new InactivityReminder()
    detector.observe(start, true, 1_000)
    const moved = nearby(200, 60_000)
    expect(detector.observe(moved, true, 60_000)).toBe(60_000 + INACTIVITY_REMINDER_MINUTES * 60_000)
    expect(detector.observe(moved, false, 120_000)).toBeNull()
    expect(detector.observe(moved, true, 180_000)).toBe(180_000 + INACTIVITY_REMINDER_MINUTES * 60_000)
  })

  it('does not schedule another reminder after the first one is due', () => {
    const detector = new InactivityReminder()
    const due = detector.observe(start, true, 1_000)!
    expect(detector.observe(start, true, due)).toBeNull()
    expect(detector.observe(nearby(200, due + 60_000), true, due + 60_000)).toBeNull()
  })

  it('checks the map from before the recording and ignores poor GPS fixes', () => {
    expect(isPreviouslyDiscovered(start, knownCells)).toBe(true)
    expect(isPreviouslyDiscovered(nearby(200, 2_000), knownCells)).toBe(false)
    const detector = new InactivityReminder()
    expect(detector.observe({ ...start, accuracy: 100 }, true, 1_000)).toBeNull()
    expect(detector.observe(start, true, 2_000)).toBe(2_000 + INACTIVITY_REMINDER_MINUTES * 60_000)
    expect(detector.observe({ ...start, accuracy: 100 }, true, 3_000)).toBeNull()
    expect(detector.observe(start, true, 4_000)).toBe(4_000 + INACTIVITY_REMINDER_MINUTES * 60_000)
  })
})
