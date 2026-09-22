import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWalkJournal, saveWalkJournal } from './walkJournal'
import type { PendingWalk } from './types'

const walk: PendingWalk = {
  id: 'walk-1',
  startedAt: 1_000,
  finishedAt: 2_000,
  points: [
    { lng: 2.17, lat: 41.38, recordedAt: 1_000, walkId: 'walk-1' },
    { lng: 2.171, lat: 41.38, recordedAt: 2_000, walkId: 'walk-1' },
  ],
}

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  })
})

describe('walk recovery journal', () => {
  it('restores an interrupted active walk and keeps accounts separate', () => {
    saveWalkJournal('user-a', [], walk)
    expect(loadWalkJournal('user-a')).toEqual([walk])
    expect(loadWalkJournal('user-b')).toEqual([])
  })

  it('keeps failed uploads until they are confirmed, then clears the journal', () => {
    saveWalkJournal('user-a', [walk])
    expect(loadWalkJournal('user-a')).toEqual([walk])
    saveWalkJournal('user-a', [])
    expect(loadWalkJournal('user-a')).toEqual([])
  })

  it('ignores an unfinished walk with too few accepted points', () => {
    saveWalkJournal('user-a', [], { ...walk, points: walk.points.slice(0, 1) })
    expect(loadWalkJournal('user-a')).toEqual([])
  })
})
