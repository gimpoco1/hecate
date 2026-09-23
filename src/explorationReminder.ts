import { discoveryCellKey, discoveryFootprintCells, distanceKm, isUsableGpsPoint, pointToDiscoveryCell } from './geo'
import type { Coordinate } from './types'

export const REMINDER_MINUTES = 5
export const REMINDER_DISTANCE_M = 150
const REMINDER_DURATION_MS = REMINDER_MINUTES * 60_000
const THREE_MINUTES = 3 * 60_000
export const REMINDER_COOLDOWN_MS = 2 * 60 * 60_000
export const REMINDER_TAP_PAUSE_MS = 30 * 60_000

export type ReminderKind = 'unmapped'

export function isUnmappedArea(point: Coordinate, knownCells: Set<string>) {
  // Stored discovery cells are the centres of the 35 m areas already revealed
  // on the map. If any stored centre overlaps the current reveal footprint,
  // the user's actual position is familiar ground even when unknown cells sit
  // around its edge.
  return !discoveryFootprintCells(pointToDiscoveryCell(point))
    .some(cell => knownCells.has(discoveryCellKey(cell)))
}

/** Runs the production detector on synthetic points without altering app data. */
export function simulateUnmappedWalk(knownCells: Set<string>, now = Date.now()) {
  for (let candidate = 0; candidate < 30; candidate += 1) {
    const detector = new ExplorationReminder()
    let result: ReminderKind | null = null
    for (let minute = 0; minute <= REMINDER_MINUTES; minute += 1) {
      const point: Coordinate = {
        lng: candidate + minute * .00035,
        lat: 0,
        accuracy: 5,
        recordedAt: now - (REMINDER_MINUTES - minute) * 60_000,
      }
      result = detector.observe(point, isUnmappedArea(point, knownCells))
    }
    if (result) return result
  }
  return null
}

const keyForUser = (userId: string) => `hecate:exploration-reminders:v1:${userId}`

export function loadReminderPreference(userId: string) {
  try {
    const value = JSON.parse(localStorage.getItem(keyForUser(userId)) || '{}') as { enabled?: boolean; promptedAt?: number; pausedUntil?: number }
    return {
      enabled: value.enabled === true,
      promptedAt: Number.isFinite(value.promptedAt) ? value.promptedAt! : 0,
      pausedUntil: Number.isFinite(value.pausedUntil) ? value.pausedUntil! : 0,
    }
  } catch {
    return { enabled: false, promptedAt: 0, pausedUntil: 0 }
  }
}

export function saveReminderPreference(userId: string, enabled: boolean, promptedAt: number, pausedUntil = 0) {
  try {
    localStorage.setItem(keyForUser(userId), JSON.stringify({ enabled, promptedAt, pausedUntil }))
  } catch { /* A disabled storage API must not break location monitoring. */ }
}

export function pauseReminderAfterTap(userId: string, tappedAt: number) {
  const preference = loadReminderPreference(userId)
  if (!preference.enabled) return preference
  const pausedUntil = tappedAt + REMINDER_TAP_PAUSE_MS
  saveReminderPreference(userId, true, 0, pausedUntil)
  return { enabled: true, promptedAt: 0, pausedUntil }
}

export function clearReminderPreference(userId: string) {
  try { localStorage.removeItem(keyForUser(userId)) }
  catch { /* Storage may be unavailable. */ }
}

/** Holds only the current candidate walk; idle samples never join saved walks. */
export class ExplorationReminder {
  private first: Coordinate | null = null
  private last: Coordinate | null = null
  private distanceM = 0
  private unmappedSegments = 0

  constructor(private lastPromptAt = 0, private pauseUntil = 0) {}

  pauseAfterTap(tappedAt: number) {
    this.reset()
    this.lastPromptAt = 0
    this.pauseUntil = tappedAt + REMINDER_TAP_PAUSE_MS
  }

  reset() {
    this.first = null
    this.last = null
    this.distanceM = 0
    this.unmappedSegments = 0
  }

  observe(point: Coordinate, unmapped: boolean): ReminderKind | null {
    if (!isUsableGpsPoint(point)) return null
    if (this.pauseUntil) {
      if (point.recordedAt < this.pauseUntil) {
        this.reset()
        return null
      }
      this.pauseUntil = 0
      this.reset()
    }
    if (!unmapped) {
      this.reset()
      return null
    }
    if (!this.last || point.recordedAt - this.last.recordedAt > THREE_MINUTES) {
      this.first = point
      this.last = point
      this.distanceM = 0
      this.unmappedSegments = 0
      return null
    }

    const elapsedMs = point.recordedAt - this.last.recordedAt
    if (elapsedMs <= 0) return null
    const movementM = distanceKm(this.last, point) * 1_000
    const uncertaintyM = Math.max(this.last.accuracy ?? 0, point.accuracy ?? 0)
    if (movementM < Math.max(20, uncertaintyM)) return null

    // A vehicle trip or GPS jump is not evidence of a walk.
    if (movementM / (elapsedMs / 1_000) > 3.2) {
      this.reset()
      this.first = point
      this.last = point
      return null
    }

    this.last = point
    this.distanceM += movementM
    this.unmappedSegments += 1
    if (!this.first || point.recordedAt - this.first.recordedAt < REMINDER_DURATION_MS
      || this.distanceM < REMINDER_DISTANCE_M || this.unmappedSegments < 3) return null
    if (this.lastPromptAt && point.recordedAt - this.lastPromptAt < REMINDER_COOLDOWN_MS) return null

    this.lastPromptAt = point.recordedAt
    this.reset()
    return 'unmapped'
  }

  get promptedAt() {
    return this.lastPromptAt
  }

  get pausedUntil() {
    return this.pauseUntil
  }

  get progress() {
    return {
      elapsedMs: this.first && this.last ? Math.max(0, this.last.recordedAt - this.first.recordedAt) : 0,
      distanceM: this.distanceM,
      unmappedSegments: this.unmappedSegments,
    }
  }
}
