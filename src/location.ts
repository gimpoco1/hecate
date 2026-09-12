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
