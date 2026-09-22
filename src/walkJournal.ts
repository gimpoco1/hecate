import type { Coordinate, PendingWalk } from './types'

type WalkJournal = { active: PendingWalk | null; pending: PendingWalk[] }

const keyForUser = (userId: string) => `hecate:walk-journal:v1:${userId}`

function validPoint(point: Coordinate) {
  return Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180
    && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && Number.isFinite(point.recordedAt)
}

function validWalk(walk: PendingWalk) {
  return typeof walk.id === 'string' && Number.isFinite(walk.startedAt)
    && Number.isFinite(walk.finishedAt) && Array.isArray(walk.points)
    && walk.points.length >= 2 && walk.points.every(validPoint)
}

export function loadWalkJournal(userId: string): PendingWalk[] {
  try {
    const raw = localStorage.getItem(keyForUser(userId))
    if (!raw) return []
    const journal = JSON.parse(raw) as WalkJournal
    const walks = [...(Array.isArray(journal.pending) ? journal.pending : []), journal.active]
    return walks.filter((walk): walk is PendingWalk => Boolean(walk && validWalk(walk)))
  } catch {
    return []
  }
}

export function saveWalkJournal(userId: string, pending: PendingWalk[], active: PendingWalk | null = null) {
  try {
    if (!pending.length && !active) localStorage.removeItem(keyForUser(userId))
    else localStorage.setItem(keyForUser(userId), JSON.stringify({ pending, active }))
    return true
  } catch {
    return false
  }
}
