import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin, CallbackError } from '@capacitor-community/background-geolocation'
import type { Coordinate } from './types'

export interface LocationTrackerError {
  code: 'permission-denied' | 'unavailable'
  message: string
}

export interface LocationTracker {
  start(onPoint: (point: Coordinate) => void, onError: (error: LocationTrackerError) => void): Promise<void>
  stop(): void | Promise<void>
}

/**
 * Reads one location without creating a walk. The background-geolocation
 * plugin exposes a watcher rather than a single-read API, so remove it as
 * soon as its first usable update arrives.
 */
export function requestCurrentLocation(): Promise<Coordinate> {
  return new Promise((resolve, reject) => {
    const tracker = createLocationTracker()
    let completed = false
    let started = false
    let stopAfterStart = false
    let timeout: number | undefined

    const stop = () => {
      if (!started) {
        stopAfterStart = true
        return
      }
      void Promise.resolve(tracker.stop()).catch(() => undefined)
    }
    const finish = (result: { point: Coordinate } | { error: Error }) => {
      if (completed) return
      completed = true
      if (timeout !== undefined) window.clearTimeout(timeout)
      stop()
      if ('point' in result) resolve(result.point)
      else reject(result.error)
    }
    timeout = window.setTimeout(() => {
      finish({ error: new Error('Timed out while getting your location.') })
    }, 15_000)

    void tracker.start(
      point => finish({ point }),
      error => finish({ error: new Error(error.message) }),
    ).then(() => {
      started = true
      if (stopAfterStart) stop()
    }).catch(error => {
      finish({ error: error instanceof Error ? error : new Error('Location is unavailable.') })
    })
  })
}

class WebLocationTracker implements LocationTracker {
  private watchId: number | null = null

  async start(onPoint: (point: Coordinate) => void, onError: (error: LocationTrackerError) => void) {
    if (!navigator.geolocation) throw new Error('Geolocation is unavailable')
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => onPoint({
        lng: coords.longitude,
        lat: coords.latitude,
        recordedAt: timestamp,
        accuracy: coords.accuracy,
      }),
      error => onError({
        code: error.code === error.PERMISSION_DENIED ? 'permission-denied' : 'unavailable',
        message: error.message,
      }),
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    )
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

function nativeError(error: CallbackError): LocationTrackerError {
  return {
    code: error.code === 'NOT_AUTHORIZED' ? 'permission-denied' : 'unavailable',
    message: error.message,
  }
}

class NativeLocationTracker implements LocationTracker {
  private watcherId: string | null = null

  async start(onPoint: (point: Coordinate) => void, onError: (error: LocationTrackerError) => void) {
    this.watcherId = await BackgroundGeolocation.addWatcher({
      backgroundTitle: 'Hecate is revealing your path',
      backgroundMessage: 'Your discovery is continuing in the background.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 8,
    }, (location, error) => {
      if (error) {
        onError(nativeError(error))
        return
      }
      if (!location) return
      onPoint({
        lng: location.longitude,
        lat: location.latitude,
        recordedAt: location.time ?? Date.now(),
        accuracy: location.accuracy,
      })
    })
  }

  async stop() {
    if (!this.watcherId) return
    const id = this.watcherId
    this.watcherId = null
    await BackgroundGeolocation.removeWatcher({ id })
  }
}

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

export function createLocationTracker(): LocationTracker {
  return isNativeApp() ? new NativeLocationTracker() : new WebLocationTracker()
}
