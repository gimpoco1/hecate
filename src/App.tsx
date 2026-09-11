import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { DiscoveryMap } from './components/DiscoveryMap'
import { SyncSheet } from './components/SyncSheet'
import { ChevronIcon, CompassIcon, HecateMark, LocateIcon, MapIcon, RouteIcon, UserIcon } from './components/Icons'
import { BARCELONA_DEMO_ROUTE, routeDistanceKm, shouldRecordPoint } from './geo'
import { createLocationTracker, isNativeApp, type LocationTracker } from './location'
import { loadLocalPoints, loadSyncedPoints, saveLocalPoints, syncPoints } from './storage'
import type { Coordinate, MapMode, TrackingState } from './types'

function formatDistance(distance: number) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  return `${distance.toFixed(distance >= 10 ? 1 : 2)} km`
}

function mergePoints(local: Coordinate[], remote: Coordinate[]) {
  const unique = new Map<string, Coordinate>()
  ;[...local, ...remote].forEach(point => unique.set(`${point.recordedAt}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`, point))
  return [...unique.values()].sort((a, b) => a.recordedAt - b.recordedAt)
}

export default function App() {
  const [mode, setMode] = useState<MapMode>('discover')
  const [points, setPoints] = useState<Coordinate[]>(() => loadLocalPoints())
  const [currentPoint, setCurrentPoint] = useState<Coordinate | undefined>(() => loadLocalPoints().at(-1))
  const [tracking, setTracking] = useState<TrackingState>('idle')
  const [zoom, setZoom] = useState(1.35)
  const [syncOpen, setSyncOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const mapRef = useRef<MapLibreMap | null>(null)
  const trackerRef = useRef<LocationTracker | null>(null)
  const lastPointRef = useRef<Coordinate | undefined>(points.at(-1))
  const distance = useMemo(() => routeDistanceKm(points), [points])
  const isCityScale = zoom >= 6
  const nativeApp = isNativeApp()

  useEffect(() => {
    loadSyncedPoints().then(remote => {
      if (!remote.length) return
      setPoints(current => mergePoints(current, remote))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    saveLocalPoints(points)
    const timer = window.setTimeout(() => syncPoints(points).catch(() => undefined), 1200)
    return () => window.clearTimeout(timer)
  }, [points])

  useEffect(() => () => { void trackerRef.current?.stop() }, [])

  const onZoomChange = useCallback((nextZoom: number) => setZoom(nextZoom), [])

  const revealBarcelona = () => {
    setShowIntro(false)
    mapRef.current?.flyTo({ center: [2.165, 41.382], zoom: 13.3, duration: 3500, essential: true })
  }

  const addPoint = (point: Coordinate) => {
    setCurrentPoint(point)
    if (!shouldRecordPoint(lastPointRef.current, point)) return
    lastPointRef.current = point
    setPoints(current => [...current, point])
    mapRef.current?.easeTo({ center: [point.lng, point.lat], duration: 850, essential: true })
  }

  const toggleTracking = async () => {
    if (tracking === 'tracking') {
      await trackerRef.current?.stop()
      trackerRef.current = null
      setTracking('idle')
      return
    }
    setTracking('requesting')
    const tracker = createLocationTracker()
    trackerRef.current = tracker
    try {
      await tracker.start(addPoint, error => {
        setTracking(error.code === 'permission-denied' ? 'denied' : 'unavailable')
      })
      setTracking('tracking')
      setShowIntro(false)
    } catch {
      setTracking('unavailable')
    }
  }

  const loadDemo = () => {
    setPoints(BARCELONA_DEMO_ROUTE)
    setCurrentPoint(BARCELONA_DEMO_ROUTE.at(-1))
    lastPointRef.current = BARCELONA_DEMO_ROUTE.at(-1)
    setShowIntro(false)
    mapRef.current?.flyTo({ center: [2.161, 41.382], zoom: 14.1, duration: 2800, essential: true })
  }

  const locate = () => {
    if (currentPoint) mapRef.current?.flyTo({ center: [currentPoint.lng, currentPoint.lat], zoom: 15, duration: 1400, essential: true })
    else void toggleTracking()
  }

  return <main className="app-shell">
    <DiscoveryMap mode={mode} points={points} currentPoint={currentPoint} onZoomChange={onZoomChange} mapRef={mapRef} />

    <header className="topbar">
      <button className="brand" onClick={() => mapRef.current?.flyTo({ center: [7, 24], zoom: 1.35, duration: 2200 })} aria-label="View the globe">
        <span className="brand__mark"><HecateMark /></span>
        <span>hecate</span>
      </button>
      <div className="mode-switch" role="group" aria-label="Map mode">
        <button className={mode === 'discover' ? 'active' : ''} onClick={() => setMode('discover')} aria-pressed={mode === 'discover'}><CompassIcon size={17} /> Discover</button>
        <button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')} aria-pressed={mode === 'map'}><MapIcon size={17} /> Map</button>
      </div>
      <button className="avatar-button" onClick={() => setSyncOpen(true)} aria-label="Account and sync"><UserIcon size={19} /></button>
    </header>

    {showIntro && zoom < 4 && <section className="globe-intro">
      <div className="eyebrow">Your world, slowly revealed</div>
      <h1>Every walk leaves<br />the world a little clearer.</h1>
      <p>Zoom into a city to see where your story has—and hasn’t—taken you.</p>
      <button onClick={revealBarcelona}>Explore Barcelona <ChevronIcon size={18} /></button>
    </section>}

    {!isCityScale && !showIntro && <div className="zoom-hint"><span /> Zoom closer to reveal discoveries</div>}

    <nav className="map-actions" aria-label="Map controls">
      <button onClick={locate} aria-label="Go to my location"><LocateIcon size={21} /></button>
      <button onClick={() => setSyncOpen(true)} aria-label="Open journey sync"><RouteIcon size={21} /></button>
    </nav>

    {isCityScale && <section className="journey-card">
      <div className="journey-card__top">
        <div>
          <div className="eyebrow">Your discovered path</div>
          <div className="distance">{formatDistance(distance)}</div>
        </div>
        <div className={`tracking-status tracking-status--${tracking}`}><span />{tracking === 'tracking' ? 'Recording' : 'Ready'}</div>
      </div>
      <div className="journey-card__bottom">
        <button className={`track-button ${tracking === 'tracking' ? 'track-button--stop' : ''}`} onClick={toggleTracking} disabled={tracking === 'requesting'}>
          <span className="track-button__icon">{tracking === 'tracking' ? <span className="stop-square" /> : <LocateIcon size={21} />}</span>
          <span><strong>{tracking === 'tracking' ? 'Finish walk' : tracking === 'requesting' ? 'Finding you…' : 'Start walking'}</strong><small>{tracking === 'tracking' ? (nativeApp ? 'Safe to lock your phone' : 'Keep this open on the web') : 'Reveal about 60 m around you'}</small></span>
        </button>
        {points.length === 0 && <button className="demo-button" onClick={loadDemo}>Preview a walk</button>}
      </div>
      {(tracking === 'denied' || tracking === 'unavailable') && <p className="location-error">Location is unavailable. Allow Hecate to use your location in Settings, or preview the sample walk.</p>}
    </section>}

    <div className="attribution-note">Open map · Your paths stay yours</div>
    <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
  </main>
}
