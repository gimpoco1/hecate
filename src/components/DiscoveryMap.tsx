import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DISCOVERY_RADIUS_M, discoveryCellCenter, metersToPixels, splitRoute } from '../geo'
import type { Coordinate, DiscoveryCell, MapMode } from '../types'

maplibregl.setWorkerUrl(mapWorkerUrl)

type Props = {
  mode: MapMode
  points: Coordinate[]
  cells: DiscoveryCell[]
  currentPoint?: Coordinate
  locationState?: 'idle' | 'located' | 'tracking'
  onMapClick?: () => void
  onZoomChange: (zoom: number) => void
  mapRef: React.MutableRefObject<MapLibreMap | null>
  initialCenter?: [number, number]
  initialZoom?: number
}

function userMarkerClassName(locationState: NonNullable<Props['locationState']>) {
  return `user-marker user-marker--${locationState}`
}

function drawMist(canvas: HTMLCanvasElement, map: MapLibreMap, points: Coordinate[], cells: DiscoveryCell[], mode: MapMode) {
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
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const currentPointRef = useRef(currentPoint)
  const locationStateRef = useRef(locationState)
  const onMapClickRef = useRef(onMapClick)
  const stateRef = useRef({ mode, points, cells })

  useEffect(() => { stateRef.current = { mode, points, cells } }, [mode, points, cells])
  useEffect(() => { currentPointRef.current = currentPoint }, [currentPoint])
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => {
    locationStateRef.current = locationState
    const element = markerRef.current?.getElement()
    if (element) element.className = userMarkerClassName(locationState)
  }, [locationState])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 19,
      renderWorldCopies: false,
    })
    mapRef.current = map

    if (import.meta.env.DEV) (window as Window & { __hecateMap?: MapLibreMap }).__hecateMap = map
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    map.on('error', event => console.error('Map rendering error', event.error))

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' })
      const point = currentPointRef.current
      if (point && !markerRef.current) {
        const element = document.createElement('div')
        element.className = userMarkerClassName(locationStateRef.current)
        element.innerHTML = '<span></span>'
        markerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([point.lng, point.lat])
          .addTo(map)
      }
    })

    const redraw = () => {
      if (canvasRef.current) drawMist(canvasRef.current, map, stateRef.current.points, stateRef.current.cells, stateRef.current.mode)
    }
    map.on('render', redraw)
    map.on('click', () => onMapClickRef.current?.())
    map.on('zoom', () => onZoomChange(map.getZoom()))
    map.on('resize', redraw)
    return () => {
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [mapRef, onZoomChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    stateRef.current = { mode, points, cells }
    map.triggerRepaint()
  }, [mapRef, mode, points, cells])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint) return
    if (!markerRef.current) {
      const element = document.createElement('div')
      element.className = userMarkerClassName(locationStateRef.current)
      element.innerHTML = '<span></span>'
      markerRef.current = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([currentPoint.lng, currentPoint.lat]).addTo(map)
    } else {
      markerRef.current.setLngLat([currentPoint.lng, currentPoint.lat])
    }
  }, [currentPoint, mapRef])

  return <div className="map-stage">
    <div ref={containerRef} className="map" aria-label="Interactive discovery map" />
    <canvas ref={canvasRef} className={`mist mist--${mode}`} aria-hidden="true" />
  </div>
}
