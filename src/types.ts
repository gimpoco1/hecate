export type Coordinate = {
  lng: number
  lat: number
  recordedAt: number
  accuracy?: number
}

export type MapMode = 'discover' | 'map'

export type TrackingState = 'idle' | 'requesting' | 'tracking' | 'denied' | 'unavailable'
