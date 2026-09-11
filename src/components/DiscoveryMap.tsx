import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { splitRoute } from '../geo'
import type { Coordinate, MapMode } from '../types'

type Props = {
  mode: MapMode
  points: Coordinate[]
  currentPoint?: Coordinate
  onZoomChange: (zoom: number) => void
  mapRef: React.MutableRefObject<MapLibreMap | null>
}

const emptyCollection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function routeData(points: Coordinate[]): GeoJSON.FeatureCollection {
  if (points.length < 2) return emptyCollection
  return {
    type: 'FeatureCollection',
    features: splitRoute(points).filter(segment => segment.length > 1).map(segment => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: segment.map(point => [point.lng, point.lat]) },
    })),
  }
}

function drawMist(canvas: HTMLCanvasElement, map: MapLibreMap, points: Coordinate[], mode: MapMode) {
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

  context.fillStyle = `rgba(239, 240, 234, ${0.9 * zoomFade})`
  context.fillRect(0, 0, rect.width, rect.height)

  if (points.length === 0) {
    context.fillStyle = `rgba(35, 58, 49, ${0.12 * zoomFade})`
    context.font = '600 13px system-ui'
    context.textAlign = 'center'
    context.fillText('Your first walk will reveal the map', rect.width / 2, rect.height / 2 - 36)
    return
  }

  const projectedSegments = splitRoute(points).map(segment => segment.map(point => map.project([point.lng, point.lat])))
  const path = () => {
    context.beginPath()
    projectedSegments.forEach(projected => projected.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y)
        if (projected.length === 1) context.lineTo(point.x + 0.01, point.y)
      } else context.lineTo(point.x, point.y)
    }))
  }

  context.lineCap = 'round'
  context.lineJoin = 'round'

  // Fine topographic echoes around explored paths, inspired by the reference.
  context.globalCompositeOperation = 'source-over'
  ;[184, 166, 148, 130, 112].forEach((lineWidth, index) => {
    path()
    context.lineWidth = lineWidth
    context.strokeStyle = `rgba(52, 73, 65, ${(0.035 + index * 0.012) * zoomFade})`
    context.stroke()
  })

  // A layered erase creates a soft, luminous reveal without a hard-edged tunnel.
  context.globalCompositeOperation = 'destination-out'
  ;[
    { width: 126, alpha: 0.16 },
    { width: 106, alpha: 0.24 },
    { width: 88, alpha: 0.4 },
    { width: 68, alpha: 0.9 },
  ].forEach(layer => {
    path()
    context.lineWidth = layer.width
    context.strokeStyle = `rgba(0, 0, 0, ${layer.alpha * zoomFade})`
    context.stroke()
  })
  context.globalCompositeOperation = 'source-over'
}

export function DiscoveryMap({ mode, points, currentPoint, onZoomChange, mapRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const stateRef = useRef({ mode, points })

  useEffect(() => { stateRef.current = { mode, points } }, [mode, points])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [7, 24],
      zoom: 1.35,
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
      map.addSource('journey', { type: 'geojson', data: routeData(stateRef.current.points) })
      map.addLayer({
        id: 'journey-halo', type: 'line', source: 'journey',
        paint: { 'line-color': '#f7ffe0', 'line-width': 11, 'line-opacity': 0.94, 'line-blur': 2 },
      })
      map.addLayer({
        id: 'journey-line', type: 'line', source: 'journey',
        paint: { 'line-color': '#94b83f', 'line-width': 4, 'line-opacity': 0.92 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    })

    const redraw = () => {
      if (canvasRef.current) drawMist(canvasRef.current, map, stateRef.current.points, stateRef.current.mode)
    }
    map.on('render', redraw)
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
    stateRef.current = { mode, points }
    const source = map.getSource('journey') as maplibregl.GeoJSONSource | undefined
    source?.setData(routeData(points))
    map.triggerRepaint()
  }, [mapRef, mode, points])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPoint) return
    if (!markerRef.current) {
      const element = document.createElement('div')
      element.className = 'user-marker'
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
