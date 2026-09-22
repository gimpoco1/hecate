import { describe, expect, it, vi } from 'vitest'
import { discoveryCellKey, discoveryFootprintCells, pointToDiscoveryCell } from './geo'
import { ExplorationReminder, isUnmappedArea, loadReminderPreference, pauseReminderAfterTap, REMINDER_TAP_PAUSE_MS, saveReminderPreference, simulateUnmappedWalk } from './explorationReminder'

const start = { lng: 2.17, lat: 41.38, accuracy: 5, recordedAt: 1_000_000 }
const step = (index: number) => ({ ...start, lng: start.lng + index * .00043, recordedAt: start.recordedAt + index * 60_000 })

describe('private exploration reminders', () => {
  it('prompts after five minutes of movement through unmapped areas, then cools down', () => {
    const reminder = new ExplorationReminder()
    for (let index = 0; index < 5; index += 1) expect(reminder.observe(step(index), true)).toBeNull()
    expect(reminder.observe(step(5), true)).toBe('unmapped')
    for (let index = 6; index <= 11; index += 1) expect(reminder.observe(step(index), true)).toBeNull()
  })

  it('discards the candidate route on notification tap and requires five fresh minutes after the 30-minute pause', () => {
    const reminder = new ExplorationReminder()
    for (let index = 0; index <= 5; index += 1) reminder.observe(step(index), true)
    const tappedAt = step(5).recordedAt
    reminder.pauseAfterTap(tappedAt)
    expect(reminder.progress).toEqual({ elapsedMs: 0, distanceM: 0, unmappedSegments: 0 })
    for (let index = 6; index < 35; index += 1) expect(reminder.observe(step(index), true)).toBeNull()
    expect(reminder.observe(step(35), true)).toBeNull()
    for (let index = 36; index < 40; index += 1) expect(reminder.observe(step(index), true)).toBeNull()
    expect(reminder.observe(step(40), true)).toBe('unmapped')
  })

  it('keeps the tap pause across an app restart without retaining location samples', () => {
    const tappedAt = step(5).recordedAt
    const reminder = new ExplorationReminder(0, tappedAt + REMINDER_TAP_PAUSE_MS)
    expect(reminder.observe(step(34), true)).toBeNull()
    expect(reminder.observe(step(35), true)).toBeNull()
    for (let index = 36; index < 40; index += 1) expect(reminder.observe(step(index), true)).toBeNull()
    expect(reminder.observe(step(40), true)).toBe('unmapped')
  })

  it('never prompts on familiar ground', () => {
    const reminder = new ExplorationReminder()
    for (let index = 0; index <= 10; index += 1) expect(reminder.observe(step(index), false)).toBeNull()
  })

  it('restarts the five-minute window when a route returns to known ground', () => {
    const reminder = new ExplorationReminder()
    for (let index = 0; index <= 3; index += 1) reminder.observe(step(index), true)
    expect(reminder.observe(step(4), false)).toBeNull()
    for (let index = 5; index < 10; index += 1) expect(reminder.observe(step(index), true)).toBeNull()
    expect(reminder.observe(step(10), true)).toBe('unmapped')
  })

  it('ignores GPS drift and vehicle movement', () => {
    const reminder = new ExplorationReminder()
    reminder.observe(start, true)
    expect(reminder.observe({ ...start, lng: start.lng + .00002, recordedAt: start.recordedAt + 60_000 }, true)).toBeNull()
    expect(reminder.observe({ ...start, lng: start.lng + .01, recordedAt: start.recordedAt + 120_000 }, true)).toBeNull()
    expect(reminder.observe(step(10), true)).toBeNull()
  })

  it('resets after a long gap and rejects inaccurate fixes', () => {
    const reminder = new ExplorationReminder()
    reminder.observe(start, true)
    expect(reminder.observe({ ...step(10), accuracy: 100 }, true)).toBeNull()
    expect(reminder.observe(step(10), true)).toBeNull()
  })

  it('checks the discovery footprint and can simulate a qualifying route without saving it', () => {
    const known = new Set(discoveryFootprintCells(pointToDiscoveryCell(start)).map(discoveryCellKey))
    expect(isUnmappedArea(start, known)).toBe(false)
    expect(isUnmappedArea(step(5), known)).toBe(true)
    expect(simulateUnmappedWalk(known, 2_000_000)).toBe('unmapped')
  })

  it('stores only the per-account switch and cooldown locally', () => {
    const entries = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value) },
    })
    try {
      saveReminderPreference('person-one', true, 123_000)
      expect(loadReminderPreference('person-one')).toEqual({ enabled: true, promptedAt: 123_000, pausedUntil: 0 })
      expect(loadReminderPreference('person-two').enabled).toBe(false)
      const tappedAt = 200_000
      expect(pauseReminderAfterTap('person-one', tappedAt)).toEqual({ enabled: true, promptedAt: 0, pausedUntil: tappedAt + REMINDER_TAP_PAUSE_MS })
      expect(loadReminderPreference('person-one').pausedUntil).toBe(tappedAt + REMINDER_TAP_PAUSE_MS)
      expect([...entries.values()][0]).toBe(`{"enabled":true,"promptedAt":0,"pausedUntil":${tappedAt + REMINDER_TAP_PAUSE_MS}}`)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
