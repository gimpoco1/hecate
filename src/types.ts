export type Coordinate = {
  lng: number
  lat: number
  recordedAt: number
  accuracy?: number
  heading?: number
  walkId?: string
  achievementEligible?: boolean
}

export type DiscoveryCell = {
  z: number
  x: number
  y: number
  discoveredAt: number
}

export type PendingWalk = {
  id: string
  startedAt: number
  finishedAt: number
  points: Coordinate[]
  achievementEligible?: boolean
}

export type MapMode = 'discover' | 'map'

export type TrackingState = 'idle' | 'requesting' | 'tracking' | 'denied' | 'unavailable'
