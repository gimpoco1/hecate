import { discoveryCellKey, discoveryFootprintCells, distanceKm, isUsableGpsPoint, pointToDiscoveryCell } from './geo'
import type { Coordinate } from './types'

export const INACTIVITY_REMINDER_MINUTES = 15
export const INACTIVITY_RADIUS_M = 150
const INACTIVITY_DURATION_MS = INACTIVITY_REMINDER_MINUTES * 60_000

export function isPreviouslyDiscovered(point: Coordinate, cellsAtStart: Set<string>) {
  return discoveryFootprintCells(pointToDiscoveryCell(point))
    .some(cell => cellsAtStart.has(discoveryCellKey(cell)))
}

/** One stop reminder per recording, while the user remains near a known spot. */
export class InactivityReminder {
  private anchor: Coordinate | null = null
  private dueAt: number | null = null
  private reminded = false

  observe(point: Coordinate, previouslyDiscovered: boolean, now: number): number | null {
    if (this.reminded) return null
    if (!isUsableGpsPoint(point)) {
      this.anchor = null
      this.dueAt = null
      return null
    }
    if (this.dueAt !== null && now >= this.dueAt) {
      this.markReminded()
      return null
    }
    if (!previouslyDiscovered) {
      this.anchor = null
      this.dueAt = null
      return null
    }
    if (!this.anchor || distanceKm(this.anchor, point) * 1_000 > INACTIVITY_RADIUS_M) {
      this.anchor = point
      this.dueAt = now + INACTIVITY_DURATION_MS
    }
    return this.dueAt
  }

  markReminded() {
    this.reminded = true
    this.dueAt = null
  }

  reset() {
    this.anchor = null
    this.dueAt = null
    this.reminded = false
  }
}
