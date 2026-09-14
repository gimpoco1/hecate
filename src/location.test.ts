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

import { createLocationTracker, openLocationSettings, requestCurrentLocation } from './location'

describe('native location lifecycle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses a foreground-only watcher for passive location refreshes', async () => {
    native.addWatcher.mockImplementation(async (_options, callback) => {
      callback({ longitude: 2.17, latitude: 41.38, accuracy: 25, time: Date.now() })
      return 'foreground-watcher'
    })
    native.removeWatcher.mockResolvedValue(undefined)

    await expect(requestCurrentLocation()).resolves.toMatchObject({
      lng: 2.17,
      lat: 41.38,
      accuracy: 25,
    })
    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.not.objectContaining({ backgroundMessage: expect.anything() }),
      expect.any(Function),
    )
    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'foreground-watcher' })
  })

  it('removes a watcher when stop is requested before registration finishes', async () => {
    let resolveWatcher!: (id: string) => void
    native.addWatcher.mockReturnValue(new Promise<string>(resolve => { resolveWatcher = resolve }))
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createLocationTracker()

    const starting = tracker.start(() => undefined, () => undefined)
    await tracker.stop()
    resolveWatcher('late-watcher')
    await starting

    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'late-watcher' })
  })

  it('classifies denied passive location requests and opens native settings', async () => {
    native.addWatcher.mockImplementation(async (_options, callback) => {
      callback(undefined, { code: 'NOT_AUTHORIZED', message: 'Location permission denied' })
      return 'denied-watcher'
    })
    native.removeWatcher.mockResolvedValue(undefined)
    native.openSettings.mockResolvedValue(undefined)

    await expect(requestCurrentLocation()).rejects.toMatchObject({ code: 'permission-denied' })
    await openLocationSettings()

    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'denied-watcher' })
    expect(native.openSettings).toHaveBeenCalledOnce()
  })

  it('uses an 8 metre filter for responsive active tracking', async () => {
    native.addWatcher.mockResolvedValue('watcher')
    const tracker = createLocationTracker()
    await tracker.start(() => undefined, () => undefined)

    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ distanceFilter: 8 }),
      expect.any(Function),
    )
  })
})
