import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  openSettings: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({
    addWatcher: native.addWatcher,
    removeWatcher: native.removeWatcher,
    openSettings: native.openSettings,
  }),
}))

import { createForegroundLocationTracker, createLocationTracker, createReminderLocationTracker, openLocationSettings, passiveLocationMode } from './location'

describe('native location lifecycle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps passive location updates in the foreground and removes the watcher when inactive', async () => {
    native.addWatcher.mockResolvedValue('foreground-watcher')
    native.removeWatcher.mockResolvedValue(undefined)
    const onPoint = vi.fn()
    const tracker = createForegroundLocationTracker()

    await tracker.start(onPoint, () => undefined)
    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        requestPermissions: true,
        stale: true,
      }),
      expect.any(Function),
    )
    expect(native.addWatcher.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({
        backgroundMessage: expect.anything(),
        backgroundTitle: expect.anything(),
      }),
    )
    native.addWatcher.mock.calls[0][1]({ longitude: 2.17, latitude: 41.38, accuracy: 25, time: Date.now() })
    expect(onPoint).toHaveBeenCalledWith(expect.objectContaining({ lng: 2.17, lat: 41.38 }))
    await tracker.stop()
    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'foreground-watcher' })
  })

  it('uses reminder monitoring only after the app leaves the foreground', () => {
    expect(passiveLocationMode(true, true)).toBe('foreground')
    expect(passiveLocationMode(true, false)).toBe('foreground')
    expect(passiveLocationMode(false, true)).toBe('reminder')
    expect(passiveLocationMode(false, false)).toBeNull()
  })

  it('removes a watcher when stop is requested before registration finishes', async () => {
    let resolveWatcher!: (id: string) => void
    native.addWatcher.mockReturnValue(new Promise<string>(resolve => { resolveWatcher = resolve }))
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createForegroundLocationTracker()

    const starting = tracker.start(() => undefined, () => undefined)
    await tracker.stop()
    resolveWatcher('late-watcher')
    await starting

    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'late-watcher' })
  })

  it('classifies denied passive location updates and opens native settings', async () => {
    native.addWatcher.mockResolvedValue('denied-watcher')
    native.removeWatcher.mockResolvedValue(undefined)
    native.openSettings.mockResolvedValue(undefined)
    const onError = vi.fn()
    const tracker = createForegroundLocationTracker()

    await tracker.start(() => undefined, onError)
    native.addWatcher.mock.calls[0][1](undefined, { code: 'NOT_AUTHORIZED', message: 'Location permission denied' })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'permission-denied' }))
    await tracker.stop()
    await openLocationSettings()

    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'denied-watcher' })
    expect(native.openSettings).toHaveBeenCalledOnce()
  })

  it('uses an 8 metre filter for responsive active tracking', async () => {
    native.addWatcher.mockResolvedValue('watcher')
    const tracker = createLocationTracker()
    await tracker.start(() => undefined, () => undefined)

    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ distanceFilter: 8, stale: false, backgroundMessage: expect.any(String), showsBackgroundLocationIndicator: true }),
      expect.any(Function),
    )
  })

  it('marks opt-in reminder monitoring as background-capable without recording a walk', async () => {
    native.addWatcher.mockResolvedValue('reminder-watcher')
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createReminderLocationTracker()
    await tracker.start(() => undefined, () => undefined)
    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ distanceFilter: 30, stale: false, backgroundMessage: expect.stringContaining('Discovery reminders'), showsBackgroundLocationIndicator: false }),
      expect.any(Function),
    )
    await tracker.stop()
    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'reminder-watcher' })
  })
})
