import { load, type Annotation, type Map as AppleMap, type MapKit } from '@apple/mapkit-loader'
import type { Coordinate } from './types'

const MAP_TILE_SIZE = 512
const MAX_LATITUDE = 85.05112878

type Padding = { top: number; right: number; bottom: number; left: number }
type FlyToOptions = {
  center: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  duration?: number
  essential?: boolean
}
type FitBoundsOptions = {
  padding?: Padding
  maxZoom?: number
  duration?: number
  essential?: boolean
}
type EaseToOptions = {
  center?: [number, number]
  pitch?: number
  bearing?: number
  duration?: number
  essential?: boolean
}

export type AppleMapHandle = {
  getZoom: () => number
  getCenter: () => { lng: number; lat: number }
  project: (coordinate: [number, number]) => { x: number; y: number }
  flyTo: (options: FlyToOptions) => void
  fitBounds: (bounds: [[number, number], [number, number]], options?: FitBoundsOptions) => void
  easeTo: (options: EaseToOptions) => void
  setUserLocation: (point: Coordinate | undefined, className: string) => void
  triggerRepaint: () => void
  remove: () => void
}

type CreateAppleMapOptions = {
  container: HTMLElement
  initialCenter: [number, number]
  initialZoom: number
  signal?: AbortSignal
  onMapClick?: () => void
  onZoomChange: (zoom: number) => void
  onRender: () => void
}

function abortError() {
  return new DOMException('Apple Maps initialization was cancelled', 'AbortError')
}

function nextAnimationFrame(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const frame = requestAnimationFrame(() => {
      signal?.removeEventListener('abort', cancel)
      resolve()
    })
    const cancel = () => {
      cancelAnimationFrame(frame)
      reject(abortError())
    }
    signal?.addEventListener('abort', cancel, { once: true })
  })
}

async function waitForContainer(container: HTMLElement, signal?: AbortSignal) {
  while (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) {
    await nextAnimationFrame(signal)
  }
}

async function waitForMapView(map: AppleMap, container: HTMLElement, signal?: AbortSignal) {
  for (let frame = 0; frame < 120; frame += 1) {
    await nextAnimationFrame(signal)
    if (!container.isConnected || container.clientWidth === 0 || container.clientHeight === 0) continue

    // MapKit installs its backing map view asynchronously. Calling camera or
    // projection APIs before this is non-null makes its renderer dereference a
    // null visibleMapRect.
    if (map.visibleMapRect) return
  }
  throw new Error('Apple Maps could not initialize its map view')
}

let mapKitPromise: Promise<MapKit> | null = null

async function loadAppleMapKit() {
  if (mapKitPromise) return mapKitPromise
  mapKitPromise = (async () => {
    const configuredToken = import.meta.env.VITE_MAPKIT_TOKEN?.trim()
    let token = configuredToken

    if (!token) {
      const configuredEndpoint = import.meta.env.VITE_MAPKIT_TOKEN_ENDPOINT?.trim()
      const isNativeBundle = !['http:', 'https:'].includes(window.location.protocol)
      const endpoint = configuredEndpoint || (isNativeBundle
        ? 'https://hecate-eta.vercel.app/api/mapkit-token'
        : '/api/mapkit-token')
      const response = await fetch(endpoint)
      if (!response.ok) throw new Error(`Apple Maps authorization failed (${response.status})`)
      token = (await response.text()).trim()
    }

    if (!token) throw new Error('Apple Maps did not return an authorization token')
    return load({ token, libraries: ['map', 'annotations'] })
  })().catch(error => {
    mapKitPromise = null
    throw error
  })
  return mapKitPromise
}

function clampLatitude(latitude: number) {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude))
}

function mercatorY(latitude: number) {
  const radians = clampLatitude(latitude) * Math.PI / 180
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
}

function latitudeFromMercatorY(value: number) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * value))) * 180 / Math.PI
}

function regionForZoom(center: [number, number], zoom: number, width: number, height: number) {
  const worldSize = MAP_TILE_SIZE * 2 ** zoom
  const longitudeDelta = Math.min(360, 360 * Math.max(1, width) / worldSize)
  const centerY = mercatorY(center[1])
  const halfHeight = Math.max(1, height) / worldSize / 2
  const north = latitudeFromMercatorY(Math.max(0, centerY - halfHeight))
  const south = latitudeFromMercatorY(Math.min(1, centerY + halfHeight))
  return {
    center: { latitude: center[1], longitude: center[0] },
    span: { latitudeDelta: Math.max(0.000001, north - south), longitudeDelta },
  }
}

function zoomForRegion(map: AppleMap, container: HTMLElement) {
  const longitudeDelta = Math.max(0.000001, map.region.span.longitudeDelta)
  return Math.log2(360 * Math.max(1, container.clientWidth) / (MAP_TILE_SIZE * longitudeDelta))
}

function userLocationElement(className: string) {
  const element = document.createElement('div')
  element.className = className
  element.innerHTML = '<span></span>'
  return element
}

export async function createAppleMap({ container, initialCenter, initialZoom, signal, onMapClick, onZoomChange, onRender }: CreateAppleMapOptions): Promise<AppleMapHandle> {
  const mapkit = await loadAppleMapKit()
  if (signal?.aborted) throw abortError()
  await waitForContainer(container, signal)

  const map = new mapkit.Map(container, {
    mapType: mapkit.MapType.MutedStandard,
    showsMapTypeControl: false,
    showsZoomControl: false,
    showsUserLocationControl: false,
    showsScale: mapkit.FeatureVisibility.Hidden,
    showsCompass: mapkit.FeatureVisibility.Adaptive,
    isRotationEnabled: true,
  })

  try {
    await waitForMapView(map, container, signal)
    map.setRegionAnimated(regionForZoom(initialCenter, initialZoom, container.clientWidth, container.clientHeight), false)
    await nextAnimationFrame(signal)
  } catch (error) {
    map.destroy()
    throw error
  }

  let userAnnotation: Annotation | null = null
  let redrawFrame: number | null = null
  let removed = false

  const redraw = () => {
    if (removed) return
    onRender()
    redrawFrame = requestAnimationFrame(redraw)
  }
  const startRedraw = () => {
    if (redrawFrame === null) redrawFrame = requestAnimationFrame(redraw)
  }
  const finishRedraw = () => {
    if (redrawFrame !== null) cancelAnimationFrame(redrawFrame)
    redrawFrame = null
    onRender()
    onZoomChange(zoomForRegion(map, container))
  }
  const handleClick = () => onMapClick?.()

  map.addEventListener('region-change-start', startRedraw)
  map.addEventListener('region-change-end', finishRedraw)
  map.addEventListener('scroll-start', startRedraw)
  map.addEventListener('scroll-end', finishRedraw)
  map.addEventListener('zoom-start', startRedraw)
  map.addEventListener('zoom-end', finishRedraw)
  map.addEventListener('rotation-start', startRedraw)
  map.addEventListener('rotation-end', finishRedraw)
  container.addEventListener('click', handleClick)

  const handle: AppleMapHandle = {
    getZoom: () => zoomForRegion(map, container),
    getCenter: () => ({ lng: map.center.longitude, lat: map.center.latitude }),
    project: ([lng, lat]) => {
      const pagePoint = map.convertCoordinateToPointOnPage({ latitude: lat, longitude: lng })
      const rect = container.getBoundingClientRect()
      return { x: pagePoint.x - rect.left - window.scrollX, y: pagePoint.y - rect.top - window.scrollY }
    },
    flyTo: options => {
      const center = options.center
      if (options.zoom === undefined) {
        map.setCenterAnimated({ latitude: center[1], longitude: center[0] }, true)
      } else {
        map.setRegionAnimated(regionForZoom(center, options.zoom, container.clientWidth, container.clientHeight), true)
      }
      if (options.bearing !== undefined) map.setRotationAnimated(options.bearing, true)
    },
    fitBounds: (bounds, options = {}) => {
      const [[west, south], [east, north]] = bounds
      const padding = options.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }
      const availableWidth = Math.max(1, container.clientWidth - padding.left - padding.right)
      const availableHeight = Math.max(1, container.clientHeight - padding.top - padding.bottom)
      const longitudeDelta = Math.max(0.000001, Math.abs(east - west) * container.clientWidth / availableWidth)
      const latitudeDelta = Math.max(0.000001, Math.abs(north - south) * container.clientHeight / availableHeight)
      const center: [number, number] = [(west + east) / 2, (south + north) / 2]
      const maxZoomRegion = regionForZoom(center, options.maxZoom ?? 19, container.clientWidth, container.clientHeight)
      map.setRegionAnimated({
        center: { latitude: center[1], longitude: center[0] },
        span: {
          latitudeDelta: Math.max(latitudeDelta, maxZoomRegion.span.latitudeDelta),
          longitudeDelta: Math.max(longitudeDelta, maxZoomRegion.span.longitudeDelta),
        },
      }, true)
    },
    easeTo: options => {
      // MapKit JS supports rotation but doesn't expose the pitched camera that
      // native MapKit does. Keep the orientation interaction without changing
      // any discovery or camera-position logic.
      if (options.center) {
        map.setCenterAnimated({ latitude: options.center[1], longitude: options.center[0] }, true)
      }
      if (options.bearing !== undefined) map.setRotationAnimated(options.bearing, true)
    },
    setUserLocation: (point, className) => {
      if (!point) return
      if (!userAnnotation) {
        const element = userLocationElement(className)
        userAnnotation = new mapkit.Annotation(
          { latitude: point.lat, longitude: point.lng },
          () => element,
          {
            accessibilityLabel: 'Current location',
            anchorOffset: new DOMPoint(0, 13.5),
            callout: null,
            size: { width: 27, height: 27 },
          },
        )
        map.addAnnotation(userAnnotation)
      } else {
        userAnnotation.coordinate = { latitude: point.lat, longitude: point.lng }
        userAnnotation.element.className = className
      }
    },
    triggerRepaint: onRender,
    remove: () => {
      removed = true
      if (redrawFrame !== null) cancelAnimationFrame(redrawFrame)
      container.removeEventListener('click', handleClick)
      map.removeEventListener('region-change-start', startRedraw)
      map.removeEventListener('region-change-end', finishRedraw)
      map.removeEventListener('scroll-start', startRedraw)
      map.removeEventListener('scroll-end', finishRedraw)
      map.removeEventListener('zoom-start', startRedraw)
      map.removeEventListener('zoom-end', finishRedraw)
      map.removeEventListener('rotation-start', startRedraw)
      map.removeEventListener('rotation-end', finishRedraw)
      if (userAnnotation) map.removeAnnotation(userAnnotation)
      map.destroy()
    },
  }

  requestAnimationFrame(() => {
    onZoomChange(handle.getZoom())
    onRender()
  })
  return handle
}
