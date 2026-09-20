import { useEffect, useRef, useState } from 'react'
import { createAppleMap, type AppleMapHandle } from '../appleMap'
import { DISCOVERY_RADIUS_M, discoveryCellCenter, metersToPixels, splitRoute } from '../geo'
import type { Coordinate, DiscoveryCell, MapMode } from '../types'

type Props = {
  mode: MapMode
  points: Coordinate[]
  cells: DiscoveryCell[]
  currentPoint?: Coordinate
  locationState?: 'idle' | 'located' | 'tracking'
  onMapClick?: () => void
  onZoomChange: (zoom: number) => void
  mapRef: React.MutableRefObject<AppleMapHandle | null>
  initialCenter?: [number, number]
  initialZoom?: number
}

function userMarkerClassName(locationState: NonNullable<Props['locationState']>) {
  return `user-marker user-marker--${locationState}`
}

function drawMist(canvas: HTMLCanvasElement, map: AppleMapHandle, points: Coordinate[], cells: DiscoveryCell[], mode: MapMode) {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.round(rect.width * ratio)
  const height = Math.round(rect.height * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)

  const zoomFade = Math.max(0, Math.min(1, (map.getZoom() - 5.5) / 2.5))
  if (mode !== 'discover' || zoomFade === 0) return

  const fogColor = `rgba(239, 240, 234, ${0.9 * zoomFade})`
  context.fillStyle = fogColor
  context.fillRect(0, 0, rect.width, rect.height)

  if (points.length === 0 && cells.length === 0) {
    context.fillStyle = `rgba(35, 58, 49, ${0.12 * zoomFade})`
    context.font = '600 13px system-ui'
    context.textAlign = 'center'
    context.fillText('Your first discovery will reveal the map', rect.width / 2, rect.height / 2 - 36)
    return
  }

  const projectedSegments = splitRoute(points).map(segment => segment.map(point => map.project([point.lng, point.lat])))
  const projectedCells = cells
    .map(cell => map.project(discoveryCellCenter(cell)))
    .filter(point => point.x > -200 && point.x < rect.width + 200 && point.y > -200 && point.y < rect.height + 200)
  const path = () => {
    context.beginPath()
    projectedSegments.forEach(projected => projected.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y)
        if (projected.length === 1) context.lineTo(point.x + 0.01, point.y)
      } else context.lineTo(point.x, point.y)
    }))
    projectedCells.forEach(point => {
      context.moveTo(point.x, point.y)
      context.lineTo(point.x + 0.01, point.y)
    })
  }

  context.lineCap = 'round'
  context.lineJoin = 'round'

  // Canvas strokes use pixels, but discovery has a fixed real-world radius.
  // Recalculate every frame so zooming changes its pixel size, not its ground area.
  const widthForMeters = (meters: number) => Math.max(0.5, metersToPixels(meters, map.getCenter().lat, map.getZoom()))
  const revealDiameterM = DISCOVERY_RADIUS_M * 2

  // Thin nested boundaries make the surrounding mist read like topographic
  // contours instead of a generic blur. Their spacing stays constant on earth.
  ;[3, 2.8, 2.6, 2.4, 2.2, 2, 1.8, 1.6, 1.4, 1.2].map(scale => revealDiameterM * scale).forEach((widthM, index) => {
    const outerWidth = widthForMeters(widthM)
    if (outerWidth < 1.5) return
    path()
    context.globalCompositeOperation = 'source-over'
    context.lineWidth = outerWidth
    context.strokeStyle = `rgba(66, 81, 74, ${(0.09 + index * 0.004) * zoomFade})`
    context.stroke()

    // Cut out the middle of the broad stroke and restore fog there, leaving
    // only a fine boundary on each side of the explored shape.
    const innerWidth = Math.max(0.5, outerWidth - Math.min(1.4, outerWidth * 0.2))
    path()
    context.globalCompositeOperation = 'destination-out'
    context.lineWidth = innerWidth
    context.strokeStyle = '#000'
    context.stroke()
    path()
    context.globalCompositeOperation = 'source-over'
    context.lineWidth = innerWidth
    context.strokeStyle = fogColor
    context.stroke()
  })

  // A layered erase exposes the actual map with a luminous, feathered edge.
  context.globalCompositeOperation = 'destination-out'
  ;[
    { widthM: revealDiameterM * 1.87, alpha: 0.12 },
    { widthM: revealDiameterM * 1.62, alpha: 0.2 },
    { widthM: revealDiameterM * 1.38, alpha: 0.32 },
    { widthM: revealDiameterM * 1.18, alpha: 0.54 },
    { widthM: revealDiameterM, alpha: 0.94 },
  ].forEach(layer => {
    path()
    context.lineWidth = widthForMeters(layer.widthM)
    context.strokeStyle = `rgba(0, 0, 0, ${layer.alpha * zoomFade})`
    context.stroke()
  })

  // The reference carries a subtle yellow-green glow in explored territory,
  // while streets and labels remain the map's own artwork underneath.
  context.globalCompositeOperation = 'source-over'
  path()
  context.lineWidth = widthForMeters(revealDiameterM * 0.97)
  context.strokeStyle = `rgba(190, 224, 74, ${0.13 * zoomFade})`
  context.stroke()
}

export function DiscoveryMap({ mode, points, cells, currentPoint, locationState = 'idle', onMapClick, onZoomChange, mapRef, initialCenter = [7, 24], initialZoom = 1.35 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const currentPointRef = useRef(currentPoint)
  const locationStateRef = useRef(locationState)
  const onMapClickRef = useRef(onMapClick)
  const onZoomChangeRef = useRef(onZoomChange)
  const stateRef = useRef({ mode, points, cells })

  useEffect(() => { stateRef.current = { mode, points, cells } }, [mode, points, cells])
  useEffect(() => { currentPointRef.current = currentPoint }, [currentPoint])
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onZoomChangeRef.current = onZoomChange }, [onZoomChange])
  useEffect(() => {
    locationStateRef.current = locationState
    mapRef.current?.setUserLocation(currentPointRef.current, userMarkerClassName(locationState))
  }, [locationState])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const container = containerRef.current
    let disposed = false
    let createdMap: AppleMapHandle | null = null
    const initialization = new AbortController()
    const redraw = () => {
      if (canvasRef.current && createdMap) drawMist(canvasRef.current, createdMap, stateRef.current.points, stateRef.current.cells, stateRef.current.mode)
    }
    const resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(container)

    void createAppleMap({
      container,
      initialCenter,
      initialZoom,
      signal: initialization.signal,
      onMapClick: () => onMapClickRef.current?.(),
      onZoomChange: zoom => onZoomChangeRef.current(zoom),
      onRender: redraw,
    }).then(map => {
      if (disposed) {
        map.remove()
        return
      }
      createdMap = map
      mapRef.current = map
      map.setUserLocation(currentPointRef.current, userMarkerClassName(locationStateRef.current))
      if (import.meta.env.DEV) window.__hecateMap = map
      redraw()
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Apple Maps failed to load', error)
      if (!disposed) setMapError(error instanceof Error ? error.message : 'Apple Maps failed to load')
    })

    return () => {
      disposed = true
      initialization.abort()
      resizeObserver.disconnect()
      createdMap?.remove()
      if (mapRef.current === createdMap) mapRef.current = null
    }
  }, [initialCenter, initialZoom, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    stateRef.current = { mode, points, cells }
    map.triggerRepaint()
  }, [mapRef, mode, points, cells])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint) return
    map.setUserLocation(currentPoint, userMarkerClassName(locationStateRef.current))
  }, [currentPoint, mapRef])

  return <div className="map-stage">
    <div ref={containerRef} className="map" aria-label="Interactive discovery map" />
    <canvas ref={canvasRef} className={`mist mist--${mode}`} aria-hidden="true" />
    {mapError && <div className="map-error" role="alert">{mapError}</div>}
  </div>
}
