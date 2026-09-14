import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { discoveredCityDistanceKm, discoveredCityPercentage, fetchCityBoundary, isPointInCity, type CityBoundary } from './city'
import { DiscoveryMap } from './components/DiscoveryMap'
import { SyncSheet } from './components/SyncSheet'
import { ChevronIcon, HecateMark, LocateIcon, LocationOffIcon, MapIcon, PerspectiveIcon, UserIcon, XIcon } from './components/Icons'
import { discoveredDistanceKm, discoveryCellCenter, discoveryCellKey, distanceKm, isUsableGpsPoint, mergeRoutePoints, pointToDiscoveryCell, routeDistanceKm, shouldRecordPoint } from './geo'
import { shouldExpandJourneySheet, shouldShowExplorationRecap, shouldStartJourneyDrag } from './journeyUi'
import { createLocationTracker, isNativeApp, LocationRequestError, openLocationSettings, requestCurrentLocation, type LocationTracker } from './location'
import { isSyncConfigured, loadDiscoveredCities, loadSyncedDiscovery, purgeLegacyDiscoveryCache, saveCompletedWalk, supabase, syncDiscoveredCity, syncDiscoveryCells } from './storage'
import type { Coordinate, DiscoveryCell, MapMode, PendingWalk, TrackingState } from './types'

type ActiveWalk = Omit<PendingWalk, 'finishedAt'> & { isTest?: boolean }
type ExplorationSummary = {
  walkId: string
  points: Coordinate[]
  cells: DiscoveryCell[]
  startedAt: number
  finishedAt: number
  newGroundKm: number
  travelledKm: number
  cityName?: string
  cityPercentageAdded?: number
}
type PassiveLocationStatus = 'idle' | 'refreshing' | 'updated' | 'current' | 'denied'

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

function formatRecapPercentage(percentage: number) {
  if (percentage <= 0) return '0%'
  if (percentage < .01) return '<0.01%'
  if (percentage < 1) return `${percentage.toFixed(2)}%`
  return formatDiscoveryPercentage(percentage, false)
}

function formatDuration(startedAt: number, finishedAt: number) {
  const minutes = Math.max(1, Math.round((finishedAt - startedAt) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} hr ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim()
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
  const [passiveLocationStatus, setPassiveLocationStatus] = useState<PassiveLocationStatus>('idle')
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
  const [discoveredCities, setDiscoveredCities] = useState<CityBoundary[]>([])
  const [citiesLoadedUserId, setCitiesLoadedUserId] = useState<string | null>(null)
  const [citiesExpanded, setCitiesExpanded] = useState(false)
  const [cityBackfillLoading, setCityBackfillLoading] = useState(false)
  const [explorationSummary, setExplorationSummary] = useState<ExplorationSummary | null>(null)
  const [testRouteRunning, setTestRouteRunning] = useState(false)
  const mapRef = useRef<MapLibreMap | null>(null)
  const trackerRef = useRef<LocationTracker | null>(null)
  const lastPointRef = useRef<Coordinate | undefined>(undefined)
  const activeWalkRef = useRef<ActiveWalk | null>(null)
  const trackingUserRef = useRef<string | null>(null)
  const pendingWalksRef = useRef<PendingWalk[]>([])
  const locationRefreshInFlightRef = useRef(false)
  const locationUpdatedTimerRef = useRef<number | null>(null)
  const journeyCardRef = useRef<HTMLElement | null>(null)
  const journeyDragRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
    currentHeight: number
    moved: boolean
    startedExpanded: boolean
  } | null>(null)
  const journeyDragFrameRef = useRef<number | null>(null)
  const journeyAnimationRef = useRef<Animation | null>(null)
  const suppressJourneyClickRef = useRef(false)
  const previewMapRef = useRef<MapLibreMap | null>(null)
  const cellsRef = useRef<DiscoveryCell[]>([])
  const cellKeysRef = useRef<Set<string>>(new Set())
  const pointsRef = useRef<Coordinate[]>([])
  const deferredLocationUiRef = useRef(false)
  const explorationStartRef = useRef<{
    cells: Set<string>
    points: Coordinate[]
    discoveryDistance: number
  } | null>(null)
  // A cell is a revealed area, not a piece of route. The saved walks preserve
  // the real route boundaries, then this function credits only portions that
  // unlock new cells.
  const discoveryDistance = useMemo(() => discoveredDistanceKm(points), [points])
  const activeCity = currentPoint && cityBoundary && isPointInCity(currentPoint, cityBoundary) ? cityBoundary : null
  const discoveryPercentage = useMemo(
    () => activeCity ? discoveredCityPercentage(cells, activeCity) : null,
    [activeCity, cells],
  )
  const currentCityDistance = useMemo(
    () => activeCity ? discoveredCityDistanceKm(points, activeCity) : discoveryDistance,
    [activeCity, discoveryDistance, points],
  )
  const discoveryLabel = accountUserId ? formatDiscoveryPercentage(discoveryPercentage, cityLoading && !activeCity) : '—'
  const isCityScale = zoom >= 6
  const nativeApp = isNativeApp()

  useEffect(() => { cellsRef.current = cells }, [cells])
  useEffect(() => { pointsRef.current = points }, [points])
  const cityProgresses = useMemo(() => {
    if (!citiesExpanded) return []
    const unique = new Map(discoveredCities.map(city => [city.id, city]))
    if (cityBoundary) unique.set(cityBoundary.id, cityBoundary)
    return [...unique.values()]
      .map(city => ({
        city,
        percentage: discoveredCityPercentage(cells, city),
        distance: discoveredCityDistanceKm(points, city),
      }))
      .sort((a, b) => b.percentage - a.percentage || a.city.name.localeCompare(b.city.name))
  }, [citiesExpanded, cityBoundary, discoveredCities, points])
  const totalCityDistance = useMemo(
    () => cityProgresses.reduce((total, progress) => total + progress.distance, 0),
    [cityProgresses],
  )

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
    setDiscoveredCities([])
    setCitiesLoadedUserId(null)
    setCitiesExpanded(false)
    setCityBackfillLoading(false)
    setCoverageInfoOpen(false)
    setExplorationSummary(null)
    setPassiveLocationStatus('idle')
    setDiscoveryLoading(Boolean(accountUserId))
    lastPointRef.current = undefined
    cellsRef.current = []
    cellKeysRef.current = new Set()
    pointsRef.current = []
    pendingWalksRef.current = []
    deferredLocationUiRef.current = false
    if (!accountUserId) return

    loadSyncedDiscovery(accountUserId).then(remote => {
      if (!active) return
      setPoints(mergeRoutePoints(remote.points))
      setCells(remote.cells)
      cellKeysRef.current = new Set(remote.cells.map(discoveryCellKey))
      lastPointRef.current = remote.points.at(-1)
    }).catch(() => undefined).finally(() => {
      if (active) setDiscoveryLoading(false)
    })
    return () => { active = false }
  }, [accountUserId])

  useEffect(() => {
    if (!citiesExpanded || !accountUserId || citiesLoadedUserId === accountUserId) return
    let active = true
    void loadDiscoveredCities(accountUserId).then(cities => {
      if (!active) return
      setDiscoveredCities(current => {
        const merged = new Map(current.map(city => [city.id, city]))
        cities.forEach(city => merged.set(city.id, city))
        return [...merged.values()]
      })
      setCitiesLoadedUserId(accountUserId)
    })
    return () => { active = false }
  }, [accountUserId, citiesExpanded, citiesLoadedUserId])

  useEffect(() => {
    if (!accountUserId || cells.length === 0 || testRouteRunning || activeWalkRef.current?.isTest) return
    const timer = window.setTimeout(() => syncDiscoveryCells(cells, accountUserId).catch(() => undefined), 1200)
    return () => window.clearTimeout(timer)
  }, [accountUserId, cells, testRouteRunning])

  useEffect(() => {
    if (!trackingUserRef.current || trackingUserRef.current === accountUserId) return
    const tracker = trackerRef.current
    trackerRef.current = null
    void Promise.resolve(tracker?.stop()).catch(() => undefined)
    activeWalkRef.current = null
    trackingUserRef.current = null
    pendingWalksRef.current = []
    setTracking('idle')
    setPassiveLocationStatus('idle')
  }, [accountUserId])

  useEffect(() => () => { void trackerRef.current?.stop() }, [])

  useEffect(() => () => {
    if (locationUpdatedTimerRef.current !== null) window.clearTimeout(locationUpdatedTimerRef.current)
  }, [])

  useEffect(() => {
    const flushBackgroundLocations = () => {
      if (document.visibilityState !== 'visible') return
      if (deferredLocationUiRef.current) {
        deferredLocationUiRef.current = false
        setPoints([...pointsRef.current])
        setCells([...cellsRef.current])
        if (lastPointRef.current) setCurrentPoint(lastPointRef.current)
      }
      // Returning to the foreground makes a one-shot fix stale, but does not
      // start a watcher or request location by itself.
      if (!trackerRef.current) {
        if (locationUpdatedTimerRef.current !== null) window.clearTimeout(locationUpdatedTimerRef.current)
        locationUpdatedTimerRef.current = null
        setPassiveLocationStatus('idle')
        setTracking(current => current === 'denied' || current === 'unavailable' ? 'idle' : current)
      }
    }
    document.addEventListener('visibilitychange', flushBackgroundLocations)
    return () => document.removeEventListener('visibilitychange', flushBackgroundLocations)
  }, [])

  const refreshCurrentLocation = useCallback(async (centerMap = false) => {
    if (locationRefreshInFlightRef.current) return
    locationRefreshInFlightRef.current = true
    setPassiveLocationStatus('refreshing')
    setTracking(current => current === 'denied' || current === 'unavailable' ? 'idle' : current)
    try {
      const point = await requestCurrentLocation()
      // A locator may initially receive an approximate fix. That is still
      // useful for moving the marker; the stricter accuracy filter remains
      // in addPoint so approximate fixes never reveal new map area.
      if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) {
        setPassiveLocationStatus('idle')
        return
      }
      setCurrentPoint(point)
      setPassiveLocationStatus('updated')
      if (locationUpdatedTimerRef.current !== null) window.clearTimeout(locationUpdatedTimerRef.current)
      locationUpdatedTimerRef.current = window.setTimeout(() => {
        setPassiveLocationStatus(current => current === 'updated' ? 'current' : current)
        locationUpdatedTimerRef.current = null
      }, 1_600)
      if (centerMap) {
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 1400, essential: true })
      }
    } catch (error) {
      // Keep the most recent known position when a fresh read is unavailable,
      // while distinguishing a permission decision from a temporary failure.
      setPassiveLocationStatus(error instanceof LocationRequestError && error.code === 'permission-denied' ? 'denied' : 'idle')
    } finally {
      locationRefreshInFlightRef.current = false
    }
  }, [])

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

  useEffect(() => {
    if (!accountUserId || !cityBoundary) return
    const hasDiscoveryInCity = cells.some(cell => {
      const [lng, lat] = discoveryCellCenter(cell)
      return isPointInCity({ lng, lat }, cityBoundary)
    })
    if (!hasDiscoveryInCity) return
    setDiscoveredCities(current => current.some(city => city.id === cityBoundary.id)
      ? current
      : [...current, cityBoundary])
    void syncDiscoveredCity(cityBoundary, accountUserId).catch(() => undefined)
  }, [accountUserId, cells, cityBoundary])

  useEffect(() => {
    if (!citiesExpanded || !accountUserId || citiesLoadedUserId !== accountUserId || points.length === 0) return
    let cancelled = false
    const knownCityIds = new Set(discoveredCities.map(city => city.id))
    const candidates: Coordinate[] = []
    // A handful of widely spaced route samples identifies past cities without
    // issuing one reverse-geocoding request for every location update.
    for (const point of points) {
      if (candidates.every(candidate => distanceKm(candidate, point) > 25)) candidates.push(point)
      if (candidates.length === 8) break
    }
    if (!candidates.length) return

    void (async () => {
      setCityBackfillLoading(true)
      for (const point of candidates) {
        if (cancelled) break
        try {
          const city = await fetchCityBoundary(point)
          if (!knownCityIds.has(city.id)) {
            const hasDiscoveryInCity = cells.some(cell => {
              const [lng, lat] = discoveryCellCenter(cell)
              return isPointInCity({ lng, lat }, city)
            })
            if (hasDiscoveryInCity) {
              knownCityIds.add(city.id)
              setDiscoveredCities(current => current.some(saved => saved.id === city.id) ? current : [...current, city])
              await syncDiscoveredCity(city, accountUserId)
            }
          }
        } catch {
          // An individual reverse-geocoding lookup should not prevent the list.
        }
        // Respect Nominatim's public-service rate limit while backfilling.
        await new Promise(resolve => window.setTimeout(resolve, 1_100))
      }
      if (!cancelled) setCityBackfillLoading(false)
    })()
    return () => { cancelled = true }
  }, [accountUserId, cells, citiesExpanded, citiesLoadedUserId, points])

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
      setPassiveLocationStatus('idle')
      setCurrentPoint(focus)
      mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: 14.3, duration: 2600, essential: true })
    } else {
      void toggleTracking()
    }
  }

  const addPoint = (point: Coordinate) => {
    if (!isUsableGpsPoint(point)) return
    const appVisible = document.visibilityState === 'visible'
    if (appVisible) setCurrentPoint(point)
    if (!shouldRecordPoint(lastPointRef.current, point)) return
    const recordedPoint = { ...point, walkId: activeWalkRef.current?.id }
    lastPointRef.current = recordedPoint
    activeWalkRef.current?.points.push(recordedPoint)
    pointsRef.current.push(recordedPoint)
    const nextCell = pointToDiscoveryCell(recordedPoint)
    const key = discoveryCellKey(nextCell)
    let discoveredNewCell = false
    if (!cellKeysRef.current.has(key)) {
      cellKeysRef.current.add(key)
      cellsRef.current.push(nextCell)
      discoveredNewCell = true
    }

    if (appVisible) {
      setPoints([...pointsRef.current])
      if (discoveredNewCell) setCells([...cellsRef.current])
      mapRef.current?.easeTo({ center: [recordedPoint.lng, recordedPoint.lat], duration: 850, essential: true })
    } else {
      // Native callbacks still record and persist the route in the background,
      // but React and MapLibre do not need to redraw for every GPS update.
      deferredLocationUiRef.current = true
    }
  }

  const finishActiveWalk = async () => {
    if (document.visibilityState === 'visible' && deferredLocationUiRef.current) {
      deferredLocationUiRef.current = false
      setPoints([...pointsRef.current])
      setCells([...cellsRef.current])
      if (lastPointRef.current) setCurrentPoint(lastPointRef.current)
    }
    const active = activeWalkRef.current
    const walkOwner = trackingUserRef.current
    activeWalkRef.current = null
    trackingUserRef.current = null
    if (active && walkOwner && active.points.length >= 2) {
      const started = explorationStartRef.current
      const completed: PendingWalk = { ...active, finishedAt: active.points.at(-1)?.recordedAt ?? Date.now() }
      if (!active.isTest) {
        pendingWalksRef.current.push(completed)
        const pending = pendingWalksRef.current
        pendingWalksRef.current = []
        for (const walk of pending) {
          try { await saveCompletedWalk(walk, walkOwner) }
          catch { pendingWalksRef.current.push(walk) }
        }
        // The recap and the next app launch must be based on the same completed
        // discovery. Do not rely only on the debounced background cell sync.
        try { await syncDiscoveryCells(cellsRef.current, walkOwner) }
        catch { /* The existing debounced sync retries if this request fails. */ }
      }
      if (started) {
        const completedCells = cellsRef.current
        const newCells = completedCells.filter(cell => !started.cells.has(`${cell.z}/${cell.x}/${cell.y}`))
        const previousCells = completedCells.filter(cell => started.cells.has(`${cell.z}/${cell.x}/${cell.y}`))
        const newGroundKm = Math.max(0, discoveredDistanceKm(pointsRef.current) - started.discoveryDistance)
        const summary: ExplorationSummary = {
          walkId: active.id,
          points: active.points,
          cells: newCells,
          startedAt: active.startedAt,
          finishedAt: completed.finishedAt,
          newGroundKm,
          travelledKm: routeDistanceKm(active.points),
        }
        setExplorationSummary(shouldShowExplorationRecap(newGroundKm) ? summary : null)

        // React state can still describe the city where tracking began. Look
        // up the final recorded position instead, then compare its coverage
        // before and after this session. This also works for test routes that
        // finish in a different city.
        const finalPoint = active.points.at(-1)
        if (finalPoint) {
          void fetchCityBoundary(finalPoint).then(city => {
            const percentageAdded = Math.max(0,
              discoveredCityPercentage(completedCells, city) - discoveredCityPercentage(previousCells, city),
            )
            if (!active.isTest) {
              setCityBoundary(city)
              setDiscoveredCities(current => current.some(saved => saved.id === city.id) ? current : [...current, city])
              void syncDiscoveredCity(city, walkOwner).catch(() => undefined)
            }
            setExplorationSummary(current => current?.walkId === active.id ? {
              ...current,
              cityName: city.name,
              cityPercentageAdded: percentageAdded,
            } : current)
          }).catch(() => {
            // A recap without a city is preferable to labelling it with a
            // stale one when reverse geocoding is temporarily unavailable.
          })
        }

        if (active.isTest) {
          // GPX routes are a visual test tool only. Restore the account's real
          // history before the recap is dismissed, so no test path can sync.
          pointsRef.current = started.points
          cellsRef.current = previousCells
          cellKeysRef.current = new Set(previousCells.map(discoveryCellKey))
          lastPointRef.current = started.points.at(-1)
          setPoints(started.points)
          setCells(previousCells)
        }
      }
    }
    explorationStartRef.current = null
  }

  const runTestRoute = async (routeFile: string) => {
    if (!accountUserId) {
      setSyncOpen(true)
      return
    }
    if (tracking !== 'idle' || testRouteRunning) return
    setTestRouteRunning(true)
    setExplorationSummary(null)
    setPassiveLocationStatus('idle')
    try {
      const response = await fetch(`/test-routes/${routeFile}`)
      if (!response.ok) throw new Error('Unable to load test route')
      const document = new DOMParser().parseFromString(await response.text(), 'application/xml')
      const route = [...document.querySelectorAll('trkpt')].flatMap((point, index): Coordinate[] => {
        const lat = Number(point.getAttribute('lat'))
        const lng = Number(point.getAttribute('lon'))
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? [{ lat, lng, accuracy: 5, recordedAt: Date.now() + index * 20_000 }]
          : []
      })
      if (route.length < 2) throw new Error('Test route needs at least two points')

      lastPointRef.current = undefined
      const startingPoints = pointsRef.current
      pointsRef.current = [...startingPoints]
      cellsRef.current = [...cellsRef.current]
      explorationStartRef.current = {
        cells: new Set(cellKeysRef.current),
        points: startingPoints,
        discoveryDistance: discoveredDistanceKm(startingPoints),
      }
      activeWalkRef.current = { id: createWalkId(), startedAt: route[0].recordedAt, points: [], isTest: true }
      trackingUserRef.current = accountUserId
      setTracking('tracking')
      setShowIntro(false)
      for (const point of route) {
        addPoint(point)
        await new Promise(resolve => window.setTimeout(resolve, 350))
      }
      await finishActiveWalk()
      setTracking('idle')
      setPassiveLocationStatus('idle')
    } catch (error) {
      console.error('Test route failed', error)
      activeWalkRef.current = null
      trackingUserRef.current = null
      explorationStartRef.current = null
      setTracking('idle')
      setPassiveLocationStatus('idle')
    } finally {
      setTestRouteRunning(false)
    }
  }

  const toggleTracking = async () => {
    if (tracking === 'tracking') {
      const tracker = trackerRef.current
      trackerRef.current = null
      try { await tracker?.stop() } catch { /* The in-memory walk must still be finalized. */ }
      await finishActiveWalk()
      setTracking('idle')
      setPassiveLocationStatus('idle')
      return
    }
    if (!accountUserId) {
      setSyncOpen(true)
      return
    }
    setTracking('requesting')
    setPassiveLocationStatus('idle')
    const walkId = createWalkId()
    lastPointRef.current = undefined
    const startingPoints = pointsRef.current
    pointsRef.current = [...startingPoints]
    cellsRef.current = [...cellsRef.current]
    explorationStartRef.current = {
      cells: new Set(cellKeysRef.current),
      points: startingPoints,
      discoveryDistance: discoveredDistanceKm(startingPoints),
    }
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
        setPassiveLocationStatus(error.code === 'permission-denied' ? 'denied' : 'idle')
        setTracking(error.code === 'permission-denied' ? 'denied' : 'unavailable')
      })
      if (!trackerFailed) {
        setTracking('tracking')
        setShowIntro(false)
      }
    } catch {
      activeWalkRef.current = null
      trackingUserRef.current = null
      setPassiveLocationStatus('idle')
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

  const journeyBounds = (card: HTMLElement) => {
    const collapsed = Number.parseFloat(window.getComputedStyle(card).minHeight) || 88
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    return { collapsed, expanded: viewportHeight * .7 }
  }

  const settleJourneySheet = (expanded: boolean, fromHeight?: number) => {
    const card = journeyCardRef.current
    if (!card) return
    const { collapsed, expanded: expandedHeight } = journeyBounds(card)
    const targetHeight = expanded ? expandedHeight : collapsed
    const startHeight = fromHeight ?? card.getBoundingClientRect().height
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    journeyAnimationRef.current?.cancel()
    card.style.height = `${startHeight}px`
    setCitiesExpanded(expanded)

    if (reducedMotion) {
      card.style.height = ''
      return
    }

    requestAnimationFrame(() => {
      const overshoot = expanded
        ? Math.min(expandedHeight + 24, expandedHeight * 1.045)
        : Math.max(collapsed - 14, collapsed * .86)
      const animation = card.animate([
        { height: `${startHeight}px` },
        { height: `${overshoot}px`, offset: .7 },
        { height: `${targetHeight}px` },
      ], {
        duration: 480,
        easing: 'cubic-bezier(.18, .9, .24, 1)',
        fill: 'forwards',
      })
      journeyAnimationRef.current = animation
      void animation.finished.catch(() => undefined).then(() => {
        if (journeyAnimationRef.current !== animation) return
        card.style.height = ''
        journeyAnimationRef.current = null
      })
    })
  }

  const beginJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    if (!shouldStartJourneyDrag(
      citiesExpanded,
      Boolean(target.closest('.journey-card__handle')),
      Boolean(target.closest('.discovery-control')),
    )) return
    const card = journeyCardRef.current
    if (!card) return
    journeyAnimationRef.current?.cancel()
    const startHeight = card.getBoundingClientRect().height
    card.style.height = `${startHeight}px`
    card.classList.add('journey-card--dragging')
    event.currentTarget.setPointerCapture(event.pointerId)
    journeyDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      currentHeight: startHeight,
      moved: false,
      startedExpanded: citiesExpanded,
    }
  }

  const moveJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = journeyDragRef.current
    const card = journeyCardRef.current
    if (!drag || !card || drag.pointerId !== event.pointerId) return
    const { collapsed, expanded } = journeyBounds(card)
    const rawHeight = drag.startHeight + drag.startY - event.clientY
    const height = rawHeight < collapsed
      ? collapsed - (collapsed - rawHeight) * .22
      : rawHeight > expanded
        ? expanded + (rawHeight - expanded) * .22
        : rawHeight
    drag.currentHeight = height
    drag.moved ||= Math.abs(event.clientY - drag.startY) > 6

    if (journeyDragFrameRef.current !== null) return
    journeyDragFrameRef.current = requestAnimationFrame(() => {
      if (journeyDragRef.current) card.style.height = `${journeyDragRef.current.currentHeight}px`
      journeyDragFrameRef.current = null
    })
  }

  const endJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = journeyDragRef.current
    const card = journeyCardRef.current
    if (!drag || !card || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (journeyDragFrameRef.current !== null) {
      cancelAnimationFrame(journeyDragFrameRef.current)
      journeyDragFrameRef.current = null
    }
    if (!drag.moved) {
      card.classList.remove('journey-card--dragging')
      card.style.height = ''
      journeyDragRef.current = null
      return
    }
    event.preventDefault()
    suppressJourneyClickRef.current = true
    window.setTimeout(() => { suppressJourneyClickRef.current = false }, 0)
    const { collapsed, expanded: expandedHeight } = journeyBounds(card)
    // Pointer-up can arrive before the final pointer-move frame. Apply that
    // last position so a single, deliberate swipe is never ignored.
    const rawEndHeight = drag.startHeight + drag.startY - event.clientY
    drag.currentHeight = rawEndHeight < collapsed
      ? collapsed - (collapsed - rawEndHeight) * .22
      : rawEndHeight > expandedHeight
        ? expandedHeight + (rawEndHeight - expandedHeight) * .22
        : rawEndHeight
    const totalDrag = event.clientY - drag.startY
    const shouldExpand = shouldExpandJourneySheet(drag.startedExpanded, totalDrag)
    card.classList.remove('journey-card--dragging')
    settleJourneySheet(shouldExpand, drag.currentHeight)
    journeyDragRef.current = null
  }

  const cancelJourneyDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = journeyDragRef.current
    const card = journeyCardRef.current
    if (!drag || !card || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (journeyDragFrameRef.current !== null) {
      cancelAnimationFrame(journeyDragFrameRef.current)
      journeyDragFrameRef.current = null
    }
    card.classList.remove('journey-card--dragging')
    card.style.height = ''
    journeyDragRef.current = null
  }

  const suppressClickAfterJourneyDrag = (event: React.MouseEvent<HTMLElement>) => {
    if (!suppressJourneyClickRef.current) return
    suppressJourneyClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const focusDiscoveredCity = (city: CityBoundary) => {
    // Close even if an older account has no matching cell geometry to focus.
    settleJourneySheet(false)
    const cityCells = cells.filter(cell => {
      const [lng, lat] = discoveryCellCenter(cell)
      return isPointInCity({ lng, lat }, city)
    })
    if (!cityCells.length) return
    const coordinates = cityCells.map(discoveryCellCenter)
    if (coordinates.length === 1) {
      mapRef.current?.flyTo({ center: coordinates[0], zoom: 14.2, duration: 900, essential: true })
      return
    }
    const longitudes = coordinates.map(([lng]) => lng)
    const latitudes = coordinates.map(([, lat]) => lat)
    mapRef.current?.fitBounds([
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ], {
      padding: { top: 110, right: 44, bottom: 150, left: 44 },
      maxZoom: 14.2,
      duration: 900,
      essential: true,
    })
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
  const locationIsCurrent = tracking === 'tracking' || passiveLocationStatus === 'updated' || passiveLocationStatus === 'current'
  const locationDisplayStatus: PassiveLocationStatus = tracking === 'denied' ? 'denied' : passiveLocationStatus
  const locationStatusText = locationDisplayStatus === 'refreshing'
    ? 'Updating location…'
    : locationDisplayStatus === 'updated'
      ? 'Location updated'
      : locationDisplayStatus === 'denied'
        ? nativeApp ? 'Location access disabled · Open Settings' : 'Location access disabled · Check browser settings'
        : 'Location idle · Tap to update'
  const locationStatusDisabled = locationDisplayStatus === 'refreshing'
    || locationDisplayStatus === 'updated'
    || (locationDisplayStatus === 'denied' && !nativeApp)
  const activateLocationStatus = () => {
    if (locationDisplayStatus === 'denied' && nativeApp) {
      void openLocationSettings().catch(() => undefined)
      return
    }
    locate()
  }

  return <main className={`app-shell ${introVisible ? 'app-shell--intro' : ''}`}>
    <DiscoveryMap
      mode={mode}
      points={points}
      cells={cells}
      currentPoint={currentPoint}
      locationState={tracking === 'tracking' ? 'tracking' : locationIsCurrent ? 'located' : 'idle'}
      onMapClick={() => {
        if (citiesExpanded) settleJourneySheet(false)
      }}
      onZoomChange={onZoomChange}
      mapRef={mapRef}
    />
    {import.meta.env.DEV && <aside className="test-route-controls" aria-label="Development test routes">
      <strong>Test routes</strong>
      <button type="button" onClick={() => void runTestRoute('barcelona-exploration.gpx')} disabled={testRouteRunning}>Barcelona</button>
      <button type="button" onClick={() => void runTestRoute('fells_loop.gpx')} disabled={testRouteRunning}>Test</button>
      <button type="button" onClick={() => void runTestRoute('barcelona-repeat.gpx')} disabled={testRouteRunning}>Repeat Barcelona</button>
      <button type="button" onClick={() => void runTestRoute('san-francisco-exploration.gpx')} disabled={testRouteRunning}>San Francisco</button>
    </aside>}

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

    {!introVisible && tracking !== 'tracking' && tracking !== 'requesting' && locationDisplayStatus !== 'current' && <button
      type="button"
      className={`location-status location-status--${locationDisplayStatus}`}
      onClick={activateLocationStatus}
      disabled={locationStatusDisabled}
      aria-live="polite"
      aria-label={locationStatusText}
    >
      <span />{locationStatusText}
    </button>}

    <nav className="map-actions" aria-label="Map controls">
      <button
        className="location-control"
        onClick={locate}
        disabled={locationDisplayStatus === 'refreshing'}
        aria-busy={locationDisplayStatus === 'refreshing'}
        aria-label={locationIsCurrent ? 'Center on current location' : 'Location is not current. Tap to update'}
        title={locationIsCurrent ? 'Current location' : 'Update my current location'}
      >{locationIsCurrent ? <LocateIcon size={21} /> : <LocationOffIcon size={21} />}</button>
      <button
        className={mode === 'map' ? 'active' : ''}
        onClick={() => setMode(currentMode => currentMode === 'discover' ? 'map' : 'discover')}
        aria-label={mode === 'map' ? 'Show my uncovered map' : 'Reveal the full map'}
        aria-pressed={mode === 'map'}
        title={mode === 'map' ? 'Show uncovered map' : 'Reveal full map'}
      ><MapIcon size={21} /></button>
      <button className={perspectiveView ? 'active' : ''} onClick={toggleMapPerspective} aria-label={perspectiveView ? 'Reset map orientation' : 'Tilt and rotate map'} aria-pressed={perspectiveView}><PerspectiveIcon size={21} /></button>
    </nav>

    {isCityScale && <section
      ref={journeyCardRef}
      className={`journey-card ${citiesExpanded ? 'journey-card--expanded' : ''}`}
      onPointerDown={beginJourneyDrag}
      onPointerMove={moveJourneyDrag}
      onPointerUp={endJourneyDrag}
      onPointerCancel={cancelJourneyDrag}
      onClickCapture={suppressClickAfterJourneyDrag}
    >
      <div className="journey-card__handle" aria-hidden="true"><span /></div>
      <div className="journey-card__summary">
        <div className="eyebrow">Your discovery</div>
        <div className="discovery-metrics">
          {accountUserId ? <>
            <div className="distance">{formatDistance(currentCityDistance)}</div>
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
        onPointerDown={event => event.stopPropagation()}
        disabled={!authReady || tracking === 'requesting'}
        aria-label={!accountUserId ? 'Sign in to start discovering' : tracking === 'tracking' ? 'Stop discovering' : tracking === 'requesting' ? 'Finding your location' : 'Start discovering'}
        title={!accountUserId ? 'Sign in to discover' : tracking === 'tracking' ? 'Stop discovering' : 'Start discovering'}
      >
        {tracking === 'tracking' ? <span className="stop-square" /> : tracking === 'requesting' ? <span className="control-spinner" /> : <span className="play-triangle" />}
      </button>
      {tracking === 'tracking' && <div className="tracking-notice"><span />{nativeApp ? 'Discovering in background' : 'Keep this page open and your screen on'}</div>}
      {tracking === 'denied' && <p className="location-error">{nativeApp
        ? 'Location access is disabled. Open Settings above to allow Hecate to use your location.'
        : 'Location access is disabled. Allow Hecate to use your location in the browser settings.'}</p>}
      {tracking === 'unavailable' && <p className="location-error">Location is temporarily unavailable. Try again, or preview the sample discovery.</p>}
      {citiesExpanded && <div className="discovered-cities" aria-label="Discovered cities">
        <div className="discovered-cities__heading"><span>Your cities</span><small>{citiesLoadedUserId !== accountUserId || cityBackfillLoading ? 'Finding past cities…' : `${cityProgresses.length} ${cityProgresses.length === 1 ? 'city' : 'cities'} · ${formatDistance(totalCityDistance)} new ground`}</small></div>
        {accountUserId ? cityProgresses.length ? <ul>
          {cityProgresses.map(({ city, percentage, distance }) => <li key={city.id}>
            <button type="button" onClick={() => focusDiscoveredCity(city)}>
              <span>{city.name}</span>
              <span className="discovered-cities__metrics"><small>{formatDistance(distance)}</small><strong>{formatDiscoveryPercentage(percentage, false)}</strong></span>
            </button>
          </li>)}
        </ul> : <p>Start a walk to add your first city.</p> : <p>Sign in to see your cities and keep them in sync.</p>}
      </div>}
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
    {explorationSummary && <div className="exploration-recap-backdrop" role="presentation">
      <section className="exploration-recap" role="dialog" aria-modal="true" aria-labelledby="exploration-recap-title">
        <div className="eyebrow">Exploration complete</div>
        <h2 id="exploration-recap-title">You made new ground yours.</h2>
        <div className="exploration-recap__map">
          <DiscoveryMap
            mode="discover"
            points={explorationSummary.points}
            cells={explorationSummary.cells}
            onZoomChange={() => undefined}
            mapRef={previewMapRef}
            initialCenter={[explorationSummary.points.at(-1)!.lng, explorationSummary.points.at(-1)!.lat]}
            initialZoom={14.2}
          />
        </div>
        <div className="exploration-recap__headline">
          <strong>{formatDistance(explorationSummary.newGroundKm)}</strong>
          <span>of new ground uncovered</span>
        </div>
        <div className="exploration-recap__insights">
          {explorationSummary.cityName && explorationSummary.cityPercentageAdded !== undefined && <span>+{formatRecapPercentage(explorationSummary.cityPercentageAdded)} of {explorationSummary.cityName}</span>}
          <span>{explorationSummary.cells.length} new discovery {explorationSummary.cells.length === 1 ? 'area' : 'areas'}</span>
          <span>{formatDuration(explorationSummary.startedAt, explorationSummary.finishedAt)} · {formatDistance(explorationSummary.travelledKm)} travelled</span>
        </div>
        <div className="exploration-recap__actions">
          <button type="button" onClick={() => setExplorationSummary(null)}>Done</button>
          <button className="exploration-recap__view" type="button" onClick={() => {
            const latest = explorationSummary.points.at(-1)
            setExplorationSummary(null)
            if (latest) mapRef.current?.flyTo({ center: [latest.lng, latest.lat], zoom: 14.2, duration: 900, essential: true })
          }}>View on map</button>
        </div>
      </section>
    </div>}
  </main>
}
