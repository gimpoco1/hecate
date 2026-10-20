import { beforeEach, describe, expect, it, vi } from 'vitest'
import { completeWalkJournal, loadWalkJournal, loadWalkJournalState, saveWalkJournal } from './walkJournal'
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
    expect(loadWalkJournalState('user-a')).toEqual({ active: walk, pending: [] })
    expect(loadWalkJournal('user-b')).toEqual([])
  })

  it('keeps failed uploads until they are confirmed, then clears the journal', () => {
    saveWalkJournal('user-a', [walk], null)
    expect(loadWalkJournal('user-a')).toEqual([walk])
    saveWalkJournal('user-a', [], null)
    expect(loadWalkJournal('user-a')).toEqual([])
  })

  it('ignores an unfinished walk with too few accepted points', () => {
    saveWalkJournal('user-a', [], { ...walk, points: walk.points.slice(0, 1) })
    expect(loadWalkJournal('user-a')).toEqual([])
    expect(loadWalkJournalState('user-a').active).toEqual({
      ...walk,
      points: walk.points.slice(0, 1),
    })
  })
})

describe('journey completion persistence', () => {
  it('preserves recovery data and pending input when storage fails, then saves once on retry', () => {
    saveWalkJournal('user-a', [], walk)
    const pending: PendingWalk[] = []
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    })
    expect(() => completeWalkJournal('user-a', pending, walk)).toThrow('Free up device storage')
    expect(pending).toEqual([])
    expect(loadWalkJournalState('user-a')).toEqual({ active: walk, pending: [] })
    setItem.mockRestore()
    const completed = completeWalkJournal('user-a', pending, walk)
    expect(completed).toEqual([walk])
    expect(loadWalkJournalState('user-a')).toEqual({ active: null, pending: [walk] })
  })

  it('retains a short journey when clearing its journal fails', () => {
    const shortWalk = { ...walk, points: walk.points.slice(0, 1) }
    saveWalkJournal('user-a', [], shortWalk)
    const removeItem = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable', 'SecurityError')
    })
    expect(() => completeWalkJournal('user-a', [], shortWalk)).toThrow('retry saving')
    expect(loadWalkJournalState('user-a').active).toEqual(shortWalk)
    removeItem.mockRestore()
    expect(completeWalkJournal('user-a', [], shortWalk)).toEqual([])
    expect(loadWalkJournalState('user-a')).toEqual({ active: null, pending: [] })
  })
})
