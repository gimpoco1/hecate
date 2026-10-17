import type { Coordinate, PendingWalk } from './types'

export type WalkJournal = { active: PendingWalk | null; pending: PendingWalk[] }

const keyForUser = (userId: string) => `hecate:walk-journal:v1:${userId}`

function validPoint(point: unknown): point is Coordinate {
  if (!point || typeof point !== 'object') return false
  const candidate = point as Partial<Coordinate>
  return typeof candidate.lng === 'number' && Number.isFinite(candidate.lng)
    && candidate.lng >= -180 && candidate.lng <= 180
    && typeof candidate.lat === 'number' && Number.isFinite(candidate.lat)
    && candidate.lat >= -90 && candidate.lat <= 90
    && typeof candidate.recordedAt === 'number'
    && Number.isFinite(candidate.recordedAt)
}

function validWalkShape(walk: unknown): walk is PendingWalk {
  if (!walk || typeof walk !== 'object') return false
  const candidate = walk as Partial<PendingWalk>
  return typeof candidate.id === 'string' && Number.isFinite(candidate.startedAt)
    && Number.isFinite(candidate.finishedAt) && Array.isArray(candidate.points)
    && candidate.points.every(validPoint)
}

function validCompletedWalk(walk: unknown): walk is PendingWalk {
  return validWalkShape(walk) && walk.points.length >= 2
}

export function loadWalkJournalState(userId: string): WalkJournal {
  try {
    const raw = localStorage.getItem(keyForUser(userId))
    if (!raw) return { active: null, pending: [] }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { active: null, pending: [] }
    const candidate = parsed as { active?: unknown; pending?: unknown }
    const pending = Array.isArray(candidate.pending)
      ? candidate.pending.filter(validCompletedWalk)
      : []
    const active = validWalkShape(candidate.active)
      ? candidate.active
      : null
    return { active, pending }
  } catch {
    return { active: null, pending: [] }
  }
}

export function loadWalkJournal(userId: string): PendingWalk[] {
  const journal = loadWalkJournalState(userId)
  return journal.active && validCompletedWalk(journal.active)
    ? [...journal.pending, journal.active]
    : journal.pending
}

export function saveWalkJournal(userId: string, pending: PendingWalk[], active: PendingWalk | null) {
  try {
    if (!pending.length && !active) localStorage.removeItem(keyForUser(userId))
    else localStorage.setItem(keyForUser(userId), JSON.stringify({ pending, active }))
    return true
  } catch {
    return false
  }
}
