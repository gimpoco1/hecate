import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { discoveredCityPercentage, fetchCityBoundary, isPointInCity, type CityBoundary } from './city'
import { DiscoveryMap } from './components/DiscoveryMap'
import { SyncSheet } from './components/SyncSheet'
import { ChevronIcon, HecateMark, LocateIcon, MapIcon, PerspectiveIcon, UserIcon, XIcon } from './components/Icons'
import { discoveredDistanceKm, discoveryCellCenter, isUsableGpsPoint, mergeDiscoveryCells, mergeRoutePoints, pointToDiscoveryCell, shouldRecordPoint } from './geo'
import { createLocationTracker, isNativeApp, requestCurrentLocation, type LocationTracker } from './location'
import { isSyncConfigured, loadSyncedDiscovery, purgeLegacyDiscoveryCache, saveCompletedWalk, supabase, syncDiscoveryCells } from './storage'
import type { Coordinate, DiscoveryCell, MapMode, PendingWalk, TrackingState } from './types'

type ActiveWalk = Omit<PendingWalk, 'finishedAt'>

function formatDistance(distance: number) {
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  return `${distance.toFixed(distance >= 10 ? 1 : 2)} km`
}

function formatDiscoveryPercentage(percentage: number | null, loading: boolean) {
  if (loading) return '…'
  if (percentage === null) return '—'
  if (percentage > 0 && percentage < .1) return '<0.1%'
  if (percentage < 10) return `${percentage.toFixed(1)}%`
  return `${Math.round(percentage)}%`
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
  const [points, setPoints] = useState<Coordinate[]>([])
  const [cells, setCells] = useState<DiscoveryCell[]>([])
  const [currentPoint, setCurrentPoint] = useState<Coordinate | undefined>()
  const [accountUserId, setAccountUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(!isSyncConfigured)
  const [tracking, setTracking] = useState<TrackingState>('idle')
  const [zoom, setZoom] = useState(1.35)
  const [syncOpen, setSyncOpen] = useState(false)
  const [coverageInfoOpen, setCoverageInfoOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [perspectiveView, setPerspectiveView] = useState(false)
  const [cityBoundary, setCityBoundary] = useState<CityBoundary | null>(null)
  const [cityLoading, setCityLoading] = useState(false)
  const mapRef = useRef<MapLibreMap | null>(null)
  const trackerRef = useRef<LocationTracker | null>(null)
  const lastPointRef = useRef<Coordinate | undefined>(undefined)
  const activeWalkRef = useRef<ActiveWalk | null>(null)
  const trackingUserRef = useRef<string | null>(null)
  const pendingWalksRef = useRef<PendingWalk[]>([])
  const locationRefreshInFlightRef = useRef(false)
  const discoveryDistance = useMemo(() => discoveredDistanceKm(points), [points])
  const activeCity = currentPoint && cityBoundary && isPointInCity(currentPoint, cityBoundary) ? cityBoundary : null
  const discoveryPercentage = useMemo(
    () => activeCity ? discoveredCityPercentage(cells, activeCity) : null,
    [activeCity, cells],
  )
  const discoveryLabel = accountUserId ? formatDiscoveryPercentage(discoveryPercentage, cityLoading && !activeCity) : '—'
  const isCityScale = zoom >= 6
  const nativeApp = isNativeApp()

  useEffect(() => {
    purgeLegacyDiscoveryCache()
    if (!supabase) return
    let active = true
    const client = supabase
    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      setAccountUserId(data.session?.user.id ?? null)
      setAuthReady(true)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setAccountUserId(session?.user.id ?? null)
      setAuthReady(true)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    setPoints([])
    setCells([])
    setDiscoveryLoading(Boolean(accountUserId))
    lastPointRef.current = undefined
    pendingWalksRef.current = []
    if (!accountUserId) return

    loadSyncedDiscovery(accountUserId).then(remote => {
      if (!active) return
      setPoints(mergeRoutePoints(remote.points))
      setCells(remote.cells)
      lastPointRef.current = remote.points.at(-1)
    }).catch(() => undefined).finally(() => {
      if (active) setDiscoveryLoading(false)
    })
    return () => { active = false }
  }, [accountUserId])

  useEffect(() => {
    if (!accountUserId || cells.length === 0) return
    const timer = window.setTimeout(() => syncDiscoveryCells(cells, accountUserId).catch(() => undefined), 1200)
    return () => window.clearTimeout(timer)
  }, [accountUserId, cells])

  useEffect(() => {
    if (!trackingUserRef.current || trackingUserRef.current === accountUserId) return
    const tracker = trackerRef.current
    trackerRef.current = null
    void Promise.resolve(tracker?.stop()).catch(() => undefined)
    activeWalkRef.current = null
    trackingUserRef.current = null
    pendingWalksRef.current = []
    setTracking('idle')
  }, [accountUserId])

  useEffect(() => () => { void trackerRef.current?.stop() }, [])

  const refreshCurrentLocation = useCallback(async (centerMap = false) => {
    if (locationRefreshInFlightRef.current) return
    locationRefreshInFlightRef.current = true
    try {
      const point = await requestCurrentLocation()
      // A locator may initially receive an approximate fix. That is still
      // useful for moving the marker; the stricter accuracy filter remains
      // in addPoint so approximate fixes never reveal new map area.
      if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return
      setCurrentPoint(point)
      if (centerMap) {
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 1400, essential: true })
      }
    } catch {
      // Keep the most recent known position when a fresh read is unavailable.
    } finally {
      locationRefreshInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    const refreshAfterReturningToApp = () => {
      if (document.visibilityState === 'visible' && tracking !== 'tracking' && currentPoint) {
        void refreshCurrentLocation()
      }
    }
    document.addEventListener('visibilitychange', refreshAfterReturningToApp)
    return () => document.removeEventListener('visibilitychange', refreshAfterReturningToApp)
  }, [currentPoint, refreshCurrentLocation, tracking])

  useEffect(() => {
    if (!currentPoint || activeCity) return
    const controller = new AbortController()
    setCityLoading(true)
    fetchCityBoundary(currentPoint, controller.signal)
      .then(setCityBoundary)
      .catch(error => {
        if (!controller.signal.aborted) console.warn('City boundary lookup failed', error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setCityLoading(false)
      })
    return () => controller.abort()
  }, [activeCity, currentPoint])

  const onZoomChange = useCallback((nextZoom: number) => setZoom(nextZoom), [])

  const openDiscoveries = () => {
    if (!accountUserId) {
      setSyncOpen(true)
      return
    }
    if (discoveryLoading) return

    const latestPoint = points.at(-1)
    const latestCell = cells.reduce<DiscoveryCell | undefined>((latest, cell) => (
      !latest || cell.discoveredAt > latest.discoveredAt ? cell : latest
    ), undefined)
    const focus = latestPoint ?? (latestCell ? (() => {
      const [lng, lat] = discoveryCellCenter(latestCell)
      return { lng, lat, recordedAt: latestCell.discoveredAt }
    })() : undefined)

    setShowIntro(false)
    if (focus) {
      setCurrentPoint(focus)
      mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: 14.3, duration: 2600, essential: true })
      void refreshCurrentLocation(true)
    } else {
      void toggleTracking()
    }
  }

  const addPoint = (point: Coordinate) => {
    if (!isUsableGpsPoint(point)) return
    setCurrentPoint(point)
    if (!shouldRecordPoint(lastPointRef.current, point)) return
    const recordedPoint = { ...point, walkId: activeWalkRef.current?.id }
    lastPointRef.current = recordedPoint
    if (activeWalkRef.current) {
      activeWalkRef.current = { ...activeWalkRef.current, points: [...activeWalkRef.current.points, recordedPoint] }
    }
    setPoints(current => [...current, recordedPoint])
    setCells(current => mergeDiscoveryCells(current, [pointToDiscoveryCell(recordedPoint)]))
    mapRef.current?.easeTo({ center: [recordedPoint.lng, recordedPoint.lat], duration: 850, essential: true })
  }

  const finishActiveWalk = async () => {
    const active = activeWalkRef.current
    const walkOwner = trackingUserRef.current
    activeWalkRef.current = null
    trackingUserRef.current = null
    if (active && walkOwner && active.points.length >= 2) {
      const completed: PendingWalk = { ...active, finishedAt: active.points.at(-1)?.recordedAt ?? Date.now() }
      pendingWalksRef.current.push(completed)
      const pending = pendingWalksRef.current
      pendingWalksRef.current = []
      for (const walk of pending) {
        try { await saveCompletedWalk(walk, walkOwner) }
        catch { pendingWalksRef.current.push(walk) }
      }
    }
  }

  const toggleTracking = async () => {
    if (tracking === 'tracking') {
      const tracker = trackerRef.current
      trackerRef.current = null
      try { await tracker?.stop() } catch { /* The in-memory walk must still be finalized. */ }
      await finishActiveWalk()
      setTracking('idle')
      return
    }
    if (!accountUserId) {
      setSyncOpen(true)
      return
    }
    setTracking('requesting')
    const walkId = createWalkId()
    lastPointRef.current = undefined
    activeWalkRef.current = { id: walkId, startedAt: Date.now(), points: [] }
    trackingUserRef.current = accountUserId
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
      trackingUserRef.current = null
      setTracking('unavailable')
    }
  }

  const locate = () => {
    // Recenter immediately on the last known point. This keeps the control
    // responsive while iOS obtains a newer fix, including for signed-out users.
    if (currentPoint) {
      mapRef.current?.flyTo({ center: [currentPoint.lng, currentPoint.lat], zoom: 15, duration: 1400, essential: true })
    }
    if (tracking !== 'tracking') void refreshCurrentLocation(true)
  }

  const toggleMapPerspective = () => {
    const map = mapRef.current
    if (!map) return
    const nextPerspective = !perspectiveView
    setPerspectiveView(nextPerspective)
    map.easeTo({
      pitch: nextPerspective ? 52 : 0,
      bearing: nextPerspective ? -24 : 0,
      duration: 900,
      essential: true,
    })
  }

  const showGlobe = () => {
    setPerspectiveView(false)
    mapRef.current?.flyTo({ center: [7, 24], zoom: 1.35, pitch: 0, bearing: 0, duration: 2200 })
  }

  const introVisible = showIntro && zoom < 4

  return <main className={`app-shell ${introVisible ? 'app-shell--intro' : ''}`}>
    <DiscoveryMap mode={mode} points={points} cells={cells} currentPoint={currentPoint} onZoomChange={onZoomChange} mapRef={mapRef} />

    <header className="topbar">
      <button className="brand" onClick={showGlobe} aria-label="View the globe">
        <span className="brand__mark"><HecateMark /></span>
        <span>Hecate</span>
      </button>
      <button className="avatar-button" onClick={() => setSyncOpen(true)} aria-label="Account and sync"><UserIcon size={19} /></button>
    </header>

    {introVisible && <section className="globe-intro">
      <div className="globe-intro__signal"><span /> {accountUserId ? points.length || cells.length ? 'Your map is ready' : 'A world to uncover' : 'Discover your world'}</div>
      <h1>{accountUserId && (points.length || cells.length) ? 'Continue where you left off.' : 'Move through the world. Make it yours.'}</h1>
      <p>{accountUserId && (points.length || cells.length)
        ? 'Return to your discoveries and uncover whatever comes next.'
        : 'Every journey reveals new places and turns movement into a map that is uniquely yours.'}</p>
      <button onClick={openDiscoveries} disabled={discoveryLoading}>
        <span><small>{discoveryLoading ? 'Syncing your account' : accountUserId ? 'Your private map' : 'Account required'}</small>{discoveryLoading ? 'Loading discoveries…' : accountUserId ? points.length || cells.length ? 'Open my discoveries' : 'Start discovering' : 'Sign in to discover'}</span>
        <span className="globe-intro__arrow"><ChevronIcon size={19} /></span>
      </button>
      <div className="globe-intro__note"><span /> {accountUserId ? points.length || cells.length ? `${formatDistance(discoveryDistance)} of new ground uncovered` : 'Nothing revealed yet' : 'Your discoveries stay with your account'}</div>
    </section>}

    {!isCityScale && !showIntro && <div className="zoom-hint"><span /> Zoom closer to reveal discoveries</div>}

    <nav className="map-actions" aria-label="Map controls">
      <button onClick={locate} aria-label="Go to my location"><LocateIcon size={21} /></button>
      <button
        className={mode === 'map' ? 'active' : ''}
        onClick={() => setMode(currentMode => currentMode === 'discover' ? 'map' : 'discover')}
        aria-label={mode === 'map' ? 'Show my uncovered map' : 'Reveal the full map'}
        aria-pressed={mode === 'map'}
        title={mode === 'map' ? 'Show uncovered map' : 'Reveal full map'}
      ><MapIcon size={21} /></button>
      <button className={perspectiveView ? 'active' : ''} onClick={toggleMapPerspective} aria-label={perspectiveView ? 'Reset map orientation' : 'Tilt and rotate map'} aria-pressed={perspectiveView}><PerspectiveIcon size={21} /></button>
    </nav>

    {isCityScale && <section className="journey-card">
      <div className="journey-card__summary">
        <div className="eyebrow">Your discovery</div>
        <div className="discovery-metrics">
          {accountUserId ? <>
            <div className="distance">{formatDistance(discoveryDistance)}</div>
            {activeCity && <button className="city-progress" onClick={() => setCoverageInfoOpen(true)} aria-label={`Explain discovery percentage for ${activeCity.name}`}>
              <strong>{discoveryLabel}</strong>
              <span>of {activeCity.name}</span>
              <span className="city-progress__info">i</span>
            </button>}
          </> : <p className="discovery-sign-in">Sign in to start tracking</p>}
        </div>
      </div>
      <button
        className={`discovery-control discovery-control--${tracking}`}
        onClick={toggleTracking}
        disabled={!authReady || tracking === 'requesting'}
        aria-label={!accountUserId ? 'Sign in to start discovering' : tracking === 'tracking' ? 'Stop discovering' : tracking === 'requesting' ? 'Finding your location' : 'Start discovering'}
        title={!accountUserId ? 'Sign in to discover' : tracking === 'tracking' ? 'Stop discovering' : 'Start discovering'}
      >
        {tracking === 'tracking' ? <span className="stop-square" /> : tracking === 'requesting' ? <span className="control-spinner" /> : <span className="play-triangle" />}
      </button>
      {tracking === 'tracking' && <div className="tracking-notice"><span />{nativeApp ? 'Discovering in background' : 'Keep this page open and your screen on'}</div>}
      {(tracking === 'denied' || tracking === 'unavailable') && <p className="location-error">Location is unavailable. Allow Hecate to use your location in Settings, or preview the sample discovery.</p>}
    </section>}

    <div className="attribution-note">Open map · Your paths stay yours</div>
    {coverageInfoOpen && activeCity && <div className="coverage-backdrop" onClick={() => setCoverageInfoOpen(false)}>
      <section className="coverage-sheet" role="dialog" aria-modal="true" aria-labelledby="coverage-title" onClick={event => event.stopPropagation()}>
        <button className="coverage-sheet__close" onClick={() => setCoverageInfoOpen(false)} aria-label="Close explanation"><XIcon size={19} /></button>
        <div className="eyebrow">City discovery</div>
        <h2 id="coverage-title">{discoveryLabel} of {activeCity.name}</h2>
        <p>Based on your current location, Hecate detected {activeCity.name} as the city you’re in. This percentage shows how much of its official municipal area you’ve uncovered.</p>
        <div className="coverage-sheet__source"><span /> Municipal boundary from OpenStreetMap</div>
      </section>
    </div>}
    <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
  </main>
}
