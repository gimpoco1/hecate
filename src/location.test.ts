import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'ios',
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  removeAllWatchers: vi.fn(),
  openSettings: vi.fn(),
  getAuthorizationStatus: vi.fn(),
  requestMotionPermission: vi.fn(),
  getMotionAuthorizationStatus: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform, isNativePlatform: () => native.platform !== 'web' },
  registerPlugin: () => ({
    addWatcher: native.addWatcher,
    removeWatcher: native.removeWatcher,
    removeAllWatchers: native.removeAllWatchers,
    openSettings: native.openSettings,
    getAuthorizationStatus: native.getAuthorizationStatus,
    requestMotionPermission: native.requestMotionPermission,
    getMotionAuthorizationStatus: native.getMotionAuthorizationStatus,
  }),
}))

import { createForegroundLocationTracker, createLocationTracker, createReminderLocationTracker, newestCoordinate, openLocationSettings, passiveLocationMode } from './location'
import { readReminderMotionAuthorization, requestReminderMotionPermission, readLocationAuthorization } from './location'

describe('iOS location authorization', () => {
  it.each(['always', 'whenInUse', 'denied', 'notDetermined'])('reads %s without requesting location', async status => {
    native.getAuthorizationStatus.mockResolvedValue({ status })
    expect(await readLocationAuthorization()).toBe(status)
  })

  it('rejects an unrecognized native permission value', async () => {
    native.getAuthorizationStatus.mockResolvedValue({ status: 'invalid' })
    await expect(readLocationAuthorization()).rejects.toThrow('Unrecognized location')
  })
})

describe('native location lifecycle', () => {
  beforeEach(() => {
    native.platform = 'ios'
    vi.clearAllMocks()
    native.removeAllWatchers.mockResolvedValue(undefined)
  })

  it('does not register a watcher when stopped during orphan cleanup', async () => {
    let resolveCleanup!: () => void
    native.removeAllWatchers.mockReturnValue(new Promise<void>(resolve => { resolveCleanup = resolve }))
    const tracker = createLocationTracker('walk-1')

    const starting = tracker.start(() => undefined, () => undefined)
    await vi.waitFor(() => expect(native.removeAllWatchers).toHaveBeenCalledOnce())
    const stopping = tracker.stop()
    resolveCleanup()
    await Promise.all([starting, stopping])

    expect(native.addWatcher).not.toHaveBeenCalled()
  })

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
        showsBackgroundLocationIndicator: false,
        journeyId: null,
        motionGated: false,
      }),
      expect.any(Function),
    )
    expect(native.addWatcher.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({
        backgroundMessage: expect.anything(),
        backgroundTitle: expect.anything(),
      }),
    )
    native.addWatcher.mock.calls[0][1]({ longitude: 2.17, latitude: 41.38, accuracy: 25, bearing: 135, time: Date.now() })
    expect(onPoint).toHaveBeenCalledWith(expect.objectContaining({ lng: 2.17, lat: 41.38, heading: 135 }))
    await tracker.stop()
    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'foreground-watcher' })
  })

  it('retries native watcher removal so a failed teardown cannot leave iOS tracking active', async () => {
    native.addWatcher.mockResolvedValue('retry-watcher')
    native.removeWatcher
      .mockRejectedValueOnce(new Error('Native watcher is still registering'))
      .mockResolvedValueOnce(undefined)
    const tracker = createLocationTracker('walk-1')

    await tracker.start(() => undefined, () => undefined)
    await tracker.stop()

    expect(native.removeWatcher).toHaveBeenCalledTimes(2)
    expect(native.removeWatcher).toHaveBeenLastCalledWith({ id: 'retry-watcher' })
  })

  it('passes native aircraft speed and airplane-mode stops to the recording validator', async () => {
    native.addWatcher.mockResolvedValue('flight-watcher')
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createLocationTracker('walk-1')
    const onPoint = vi.fn()
    const onError = vi.fn()
    await tracker.start(onPoint, onError)
    const callback = native.addWatcher.mock.calls[0][1]
    callback({ longitude: 2.17, latitude: 41.38, accuracy: 5, speed: 230, time: 1_000 })
    expect(onPoint).toHaveBeenCalledWith(expect.objectContaining({ speed: 230 }))
    callback(null, { code: 'AIRPLANE_MODE', message: 'Journey stopped because airplane mode is on.' })
    expect(onError).toHaveBeenCalledWith({ code: 'journey-stopped', message: 'Journey stopped because airplane mode is on.' })
    await tracker.stop()
  })

  it('ignores queued native callbacks as soon as watcher teardown begins', async () => {
    let resolveRemoval!: () => void
    native.addWatcher.mockResolvedValue('slow-removal-watcher')
    native.removeWatcher.mockReturnValue(new Promise<void>(resolve => { resolveRemoval = resolve }))
    const onPoint = vi.fn()
    const onError = vi.fn()
    const tracker = createLocationTracker('walk-1')

    await tracker.start(onPoint, onError)
    const callback = native.addWatcher.mock.calls[0][1]
    const stopping = tracker.stop()
    callback({ longitude: 2.17, latitude: 41.38, accuracy: 5, time: Date.now() })
    callback(undefined, { code: 'NOT_AUTHORIZED', message: 'Too late' })

    expect(onPoint).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    resolveRemoval()
    await stopping
  })

  it('uses reminder monitoring only after the app leaves the foreground', () => {
    expect(passiveLocationMode(true, true)).toBe('foreground')
    expect(passiveLocationMode(true, false)).toBe('foreground')
    expect(passiveLocationMode(false, true)).toBe('reminder')
    expect(passiveLocationMode(false, false)).toBeNull()
  })

  it('centres the discovery map on the freshest live user position', () => {
    const older = { lng: 2.1, lat: 41.3, recordedAt: 100 }
    const newer = { lng: 2.2, lat: 41.4, recordedAt: 200 }

    expect(newestCoordinate(older, newer)).toBe(newer)
    expect(newestCoordinate(undefined, older)).toBe(older)
  })

  it('removes a watcher when stop is requested before registration finishes', async () => {
    let resolveWatcher!: (id: string) => void
    native.addWatcher.mockReturnValue(new Promise<string>(resolve => { resolveWatcher = resolve }))
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createForegroundLocationTracker()

    const starting = tracker.start(() => undefined, () => undefined)
    await vi.waitFor(() => expect(native.addWatcher).toHaveBeenCalledOnce())
    const stopping = tracker.stop()
    resolveWatcher('late-watcher')
    await Promise.all([starting, stopping])

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
    const tracker = createLocationTracker('walk-1')
    await tracker.start(() => undefined, () => undefined)

    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'walk-1', motionGated: false, distanceFilter: 8, stale: false, backgroundMessage: expect.any(String), showsBackgroundLocationIndicator: true }),
      expect.any(Function),
    )
  })

  it('waits for a stopped watcher to finish removal before registering the next mode', async () => {
    let resolveRemoval!: () => void
    native.addWatcher.mockResolvedValueOnce('outgoing').mockResolvedValueOnce('incoming')
    native.removeWatcher.mockReturnValueOnce(new Promise<void>(resolve => { resolveRemoval = resolve })).mockResolvedValue(undefined)
    const foreground = createForegroundLocationTracker()
    await foreground.start(() => undefined, () => undefined)
    const stopping = foreground.stop()
    const reminder = createReminderLocationTracker()
    const starting = reminder.start(() => undefined, () => undefined)
    await vi.waitFor(() => expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'outgoing' }))
    expect(native.addWatcher).toHaveBeenCalledTimes(1)
    resolveRemoval()
    await Promise.all([stopping, starting])
    expect(native.addWatcher).toHaveBeenCalledTimes(2)
    await reminder.stop()
  })

  it('cleans up a failed registration before a later tracker can start', async () => {
    native.addWatcher.mockRejectedValueOnce(new Error('Native registration failed'))
    const failed = createReminderLocationTracker()
    await expect(failed.start(() => undefined, () => undefined)).rejects.toThrow('Native registration failed')
    await failed.stop()
    expect(native.removeAllWatchers).toHaveBeenCalledOnce()
    native.addWatcher.mockResolvedValueOnce('restarted-foreground')
    native.removeWatcher.mockResolvedValue(undefined)
    const foreground = createForegroundLocationTracker()
    await foreground.start(() => undefined, () => undefined)
    await foreground.stop()
    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'restarted-foreground' })
  })

  it.each(['authorized', 'denied', 'restricted', 'notDetermined', 'unavailable'] as const)('reads motion status %s without asking for permission', async status => {
    native.getMotionAuthorizationStatus.mockResolvedValue({ status })
    expect(await readReminderMotionAuthorization()).toBe(status)
    expect(native.requestMotionPermission).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized native motion permission status', async () => {
    native.getMotionAuthorizationStatus.mockResolvedValue({ status: 'invalid' })
    await expect(readReminderMotionAuthorization()).rejects.toThrow('Unrecognized Motion & Fitness authorization status')
  })

  it('uses Android Physical activity permission and motion-gates its reminder watcher', async () => {
    native.platform = 'android'
    native.getMotionAuthorizationStatus.mockResolvedValue({ status: 'denied' })
    native.requestMotionPermission.mockResolvedValue({ granted: false })
    expect(await readReminderMotionAuthorization()).toBe('denied')
    expect(await requestReminderMotionPermission()).toBe(false)
    native.addWatcher.mockResolvedValue('android-reminder')
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createReminderLocationTracker()
    await tracker.start(() => undefined, () => undefined)
    expect(native.addWatcher).toHaveBeenCalledWith(expect.objectContaining({ motionGated: true, journeyId: null }), expect.any(Function))
    await tracker.stop()
  })

  it('requires an explicit native Motion & Fitness permission result', async () => {
    native.requestMotionPermission.mockResolvedValueOnce({ granted: true }).mockResolvedValueOnce({ granted: false }).mockResolvedValueOnce({})
    expect(await requestReminderMotionPermission()).toBe(true)
    expect(await requestReminderMotionPermission()).toBe(false)
    await expect(requestReminderMotionPermission()).rejects.toThrow('boolean granted')
  })

  it('marks opt-in reminder monitoring as background-capable without recording a walk', async () => {
    native.addWatcher.mockResolvedValue('reminder-watcher')
    native.removeWatcher.mockResolvedValue(undefined)
    const tracker = createReminderLocationTracker()
    await tracker.start(() => undefined, () => undefined)
    expect(native.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: null, motionGated: true, distanceFilter: 30, stale: false, backgroundMessage: expect.stringContaining('Discovery reminders'), showsBackgroundLocationIndicator: false }),
      expect.any(Function),
    )
    await tracker.stop()
    expect(native.removeWatcher).toHaveBeenCalledWith({ id: 'reminder-watcher' })
  })
})
