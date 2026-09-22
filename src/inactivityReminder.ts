import { discoveryCellKey, discoveryFootprintCells, distanceKm, isUsableGpsPoint, pointToDiscoveryCell } from './geo'
import type { Coordinate } from './types'

export const INACTIVITY_REMINDER_MINUTES = 15
export const INACTIVITY_RADIUS_M = 150
const INACTIVITY_DURATION_MS = INACTIVITY_REMINDER_MINUTES * 60_000

/** Includes cells revealed earlier in the current recording. */
export function isDiscoveredArea(point: Coordinate, discoveredCells: Set<string>) {
  return discoveryFootprintCells(pointToDiscoveryCell(point))
    .some(cell => discoveredCells.has(discoveryCellKey(cell)))
}

/** One stop reminder per recording, while the user remains near a known spot. */
export class InactivityReminder {
  private anchor: Coordinate | null = null
  private dueAt: number | null = null
  private reminded = false

  observe(point: Coordinate, discovered: boolean, now: number): number | null {
    // A poor fix cannot tell us whether the person has moved, so keep the
    // current reminder until a usable location or a tracker error arrives.
    if (!isUsableGpsPoint(point)) return this.dueAt
    if (!discovered) {
      if (this.dueAt !== null && now >= this.dueAt) this.reminded = true
      this.anchor = null
      this.dueAt = null
      return null
    }
    if (!this.anchor || distanceKm(this.anchor, point) * 1_000 > INACTIVITY_RADIUS_M) {
      // Once the old due time has passed, its notification may already have
      // appeared. Do not schedule another stop reminder for this recording.
      if (this.dueAt !== null && now >= this.dueAt) {
        this.markReminded()
        this.anchor = null
        this.dueAt = null
        return null
      }
      if (this.reminded) return this.dueAt
      this.anchor = point
      this.dueAt = now + INACTIVITY_DURATION_MS
    }
    if (this.reminded) return this.dueAt
    if (this.dueAt !== null && now >= this.dueAt) this.markReminded()
    return this.dueAt
  }

  markReminded() {
    this.reminded = true
  }

  reset() {
    this.anchor = null
    this.dueAt = null
    this.reminded = false
  }
}
