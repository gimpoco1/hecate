import type { Coordinate } from './types'

export interface LocationTracker {
  start(onPoint: (point: Coordinate) => void, onError: (error: GeolocationPositionError) => void): Promise<void>
  stop(): void
}

class WebLocationTracker implements LocationTracker {
  private watchId: number | null = null

  async start(onPoint: (point: Coordinate) => void, onError: (error: GeolocationPositionError) => void) {
    if (!navigator.geolocation) throw new Error('Geolocation is unavailable')
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => onPoint({
        lng: coords.longitude,
        lat: coords.latitude,
        recordedAt: timestamp,
        accuracy: coords.accuracy,
      }),
      onError,
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    )
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }
}

// Capacitor can replace this factory with a native background-location adapter.
// The rest of the app only depends on the LocationTracker contract above.
export function createLocationTracker(): LocationTracker {
  return new WebLocationTracker()
}
