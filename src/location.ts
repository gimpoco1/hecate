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
export async function requestCurrentLocation(): Promise<Coordinate> {
  if (isNativeApp()) {
    return new Promise((resolve, reject) => {
      let watcherId: string | null = null
      let completed = false
      const timeout = globalThis.setTimeout(() => finish({ error: new Error('Timed out while getting your location.') }), 10_000)

      const stop = () => {
        if (watcherId) void BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => undefined)
      }
      const finish = (result: { point: Coordinate } | { error: Error }) => {
        if (completed) return
        completed = true
        globalThis.clearTimeout(timeout)
        stop()
        if ('point' in result) resolve(result.point)
        else reject(result.error)
      }

      void BackgroundGeolocation.addWatcher({
        // Omitting backgroundMessage keeps allowsBackgroundLocationUpdates and
        // the iOS background indicator disabled for this short-lived request.
        requestPermissions: true,
        stale: true,
        distanceFilter: 20,
      }, (location, error) => {
        if (error) {
          finish({ error: new Error(error.message) })
          return
        }
        if (!location) return
        const recordedAt = location.time ?? Date.now()
        // A recent cached position avoids powering GPS back up. Ignore an old
        // cached callback and wait for the watcher's fresh follow-up instead.
        if (recordedAt < Date.now() - 60_000) return
        finish({ point: {
          lng: location.longitude,
          lat: location.latitude,
          recordedAt,
          accuracy: location.accuracy,
        } })
      }).then(id => {
        watcherId = id
        if (completed) stop()
      }).catch(error => finish({
        error: error instanceof Error ? error : new Error('Location is unavailable.'),
      }))
    })
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is unavailable.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({
        lng: coords.longitude,
        lat: coords.latitude,
        recordedAt: timestamp,
        accuracy: coords.accuracy,
      }),
      error => reject(new Error(error.message)),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    )
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
  private stopRequested = false

  async start(onPoint: (point: Coordinate) => void, onError: (error: LocationTrackerError) => void) {
    this.stopRequested = false
    const watcherId = await BackgroundGeolocation.addWatcher({
      backgroundTitle: 'Hecate is revealing your path',
      backgroundMessage: 'Your discovery is continuing in the background.',
      requestPermissions: true,
      stale: false,
      // Keep foreground movement visibly responsive while the user watches
      // the map. Background battery savings come from suppressing hidden UI
      // redraws, not from making the recorded route noticeably coarser.
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
    if (this.stopRequested) {
      await BackgroundGeolocation.removeWatcher({ id: watcherId })
      return
    }
    this.watcherId = watcherId
  }

  async stop() {
    this.stopRequested = true
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
