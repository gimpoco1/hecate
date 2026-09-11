import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { DiscoveryMap } from './components/DiscoveryMap'
import { SyncSheet } from './components/SyncSheet'
import { ChevronIcon, CompassIcon, HecateMark, LocateIcon, MapIcon, RouteIcon, UserIcon } from './components/Icons'
import { BARCELONA_DEMO_ROUTE, discoveryCellsFromPoints, mergeDiscoveryCells, pointToDiscoveryCell, routeDistanceKm, shouldRecordPoint } from './geo'
import { createLocationTracker, isNativeApp, type LocationTracker } from './location'
import { clearActiveWalk, flushWalkOutbox, loadActiveWalk, loadLocalCells, loadLocalPoints, loadSyncedDiscovery, queueCompletedWalk, saveActiveWalk, saveLocalCells, saveLocalPoints, syncDiscoveryCells } from './storage'
import type { Coordinate, DiscoveryCell, MapMode, PendingWalk, TrackingState } from './types'

function formatDistance(distance: number) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  return `${distance.toFixed(distance >= 10 ? 1 : 2)} km`
}

function mergePoints(local: Coordinate[], remote: Coordinate[]) {
  const unique = new Map<string, Coordinate>()
  ;[...local, ...remote].forEach(point => unique.set(`${point.recordedAt}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`, point))
  return [...unique.values()].sort((a, b) => a.recordedAt - b.recordedAt)
}

function createWalkId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export default function App() {
  const [mode, setMode] = useState<MapMode>('discover')
  const [points, setPoints] = useState<Coordinate[]>(() => loadLocalPoints())
  const [cells, setCells] = useState<DiscoveryCell[]>(() => loadLocalCells())
  const [currentPoint, setCurrentPoint] = useState<Coordinate | undefined>(() => loadLocalPoints().at(-1))
  const [tracking, setTracking] = useState<TrackingState>('idle')
  const [zoom, setZoom] = useState(1.35)
  const [syncOpen, setSyncOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [demoMode, setDemoMode] = useState(false)
  const mapRef = useRef<MapLibreMap | null>(null)
  const trackerRef = useRef<LocationTracker | null>(null)
  const lastPointRef = useRef<Coordinate | undefined>(points.at(-1))
  const activeWalkRef = useRef(loadActiveWalk())
  const displayedPoints = demoMode ? BARCELONA_DEMO_ROUTE : points
  const displayedCells = demoMode ? discoveryCellsFromPoints(BARCELONA_DEMO_ROUTE) : cells
  const distance = useMemo(() => routeDistanceKm(displayedPoints), [displayedPoints])
  const isCityScale = zoom >= 6
  const nativeApp = isNativeApp()

  useEffect(() => {
    const interrupted = activeWalkRef.current
    if (interrupted) {
      if (interrupted.points.length) {
        queueCompletedWalk({
          ...interrupted,
          finishedAt: interrupted.points.at(-1)?.recordedAt ?? Date.now(),
        })
      }
      clearActiveWalk()
      activeWalkRef.current = null
    }
    void flushWalkOutbox()

    loadSyncedDiscovery().then(remote => {
      if (remote.points.length) setPoints(current => mergePoints(current, remote.points))
      if (remote.cells.length) setCells(current => mergeDiscoveryCells(current, remote.cells))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    saveLocalPoints(points)
  }, [points])

  useEffect(() => {
    saveLocalCells(cells)
    const timer = window.setTimeout(() => syncDiscoveryCells(cells).catch(() => undefined), 1200)
    return () => window.clearTimeout(timer)
  }, [cells])

  useEffect(() => () => { void trackerRef.current?.stop() }, [])

  const onZoomChange = useCallback((nextZoom: number) => setZoom(nextZoom), [])

  const revealBarcelona = () => {
    setShowIntro(false)
    mapRef.current?.flyTo({ center: [2.165, 41.382], zoom: 13.3, duration: 3500, essential: true })
  }

  const addPoint = (point: Coordinate) => {
    setCurrentPoint(point)
    if (!shouldRecordPoint(lastPointRef.current, point)) return
    const recordedPoint = { ...point, walkId: activeWalkRef.current?.id }
    lastPointRef.current = recordedPoint
    if (activeWalkRef.current) {
      activeWalkRef.current = { ...activeWalkRef.current, points: [...activeWalkRef.current.points, recordedPoint] }
      saveActiveWalk(activeWalkRef.current)
    }
    setPoints(current => [...current, recordedPoint])
    setCells(current => mergeDiscoveryCells(current, [pointToDiscoveryCell(recordedPoint)]))
    mapRef.current?.easeTo({ center: [recordedPoint.lng, recordedPoint.lat], duration: 850, essential: true })
  }

  const finishActiveWalk = async () => {
    const active = activeWalkRef.current
    activeWalkRef.current = null
    clearActiveWalk()
    if (active && active.points.length >= 2) {
      const completed: PendingWalk = { ...active, finishedAt: active.points.at(-1)?.recordedAt ?? Date.now() }
      queueCompletedWalk(completed)
      await flushWalkOutbox()
    }
  }

  const toggleTracking = async () => {
    if (tracking === 'tracking') {
      const tracker = trackerRef.current
      trackerRef.current = null
      try { await tracker?.stop() } catch { /* The local walk must still be finalized. */ }
      await finishActiveWalk()
      setTracking('idle')
      return
    }
    setDemoMode(false)
    setTracking('requesting')
    const walkId = createWalkId()
    lastPointRef.current = undefined
    activeWalkRef.current = { id: walkId, startedAt: Date.now(), points: [] }
    saveActiveWalk(activeWalkRef.current)
    const tracker = createLocationTracker()
    trackerRef.current = tracker
    let trackerFailed = false
    try {
      await tracker.start(addPoint, error => {
        trackerFailed = true
        void Promise.resolve(tracker.stop()).catch(() => undefined)
        trackerRef.current = null
        void finishActiveWalk()
        setTracking(error.code === 'permission-denied' ? 'denied' : 'unavailable')
      })
      if (!trackerFailed) {
        setTracking('tracking')
        setShowIntro(false)
      }
    } catch {
      activeWalkRef.current = null
      clearActiveWalk()
      setTracking('unavailable')
    }
  }

  const loadDemo = () => {
    setDemoMode(true)
    setCurrentPoint(BARCELONA_DEMO_ROUTE.at(-1))
    setShowIntro(false)
    mapRef.current?.flyTo({ center: [2.161, 41.382], zoom: 14.1, duration: 2800, essential: true })
  }

  const locate = () => {
    if (currentPoint) mapRef.current?.flyTo({ center: [currentPoint.lng, currentPoint.lat], zoom: 15, duration: 1400, essential: true })
    else void toggleTracking()
  }

  return <main className="app-shell">
    <DiscoveryMap mode={mode} points={displayedPoints} cells={displayedCells} currentPoint={currentPoint} onZoomChange={onZoomChange} mapRef={mapRef} />

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
