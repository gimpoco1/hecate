import { DISCOVERY_RADIUS_M, discoveryCellCenter } from './geo'
import type { Coordinate, DiscoveryCell } from './types'

const EARTH_RADIUS_KM = 6371.0088
const EARTH_CIRCUMFERENCE_M = 40_075_016.686

type CityGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon

export type CityBoundary = {
  id: string
  name: string
  geometry: CityGeometry
  fetchedAt: number
}

function pointInRing(lng: number, lat: number, ring: GeoJSON.Position[]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [lngA, latA] = ring[index]
    const [lngB, latB] = ring[previous]
    const crosses = (latA > lat) !== (latB > lat)
      && lng < ((lngB - lngA) * (lat - latA)) / (latB - latA) + lngA
    if (crosses) inside = !inside
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Position[][]) {
  if (!polygon.length || !pointInRing(lng, lat, polygon[0])) return false
  return !polygon.slice(1).some(hole => pointInRing(lng, lat, hole))
}

export function isPointInCity(point: Pick<Coordinate, 'lng' | 'lat'>, city: CityBoundary) {
  const polygons = city.geometry.type === 'Polygon' ? [city.geometry.coordinates] : city.geometry.coordinates
  return polygons.some(polygon => pointInPolygon(point.lng, point.lat, polygon))
}

function ringAreaKm2(ring: GeoJSON.Position[]) {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    const lngDelta = (next[0] - current[0]) * Math.PI / 180
    const latA = current[1] * Math.PI / 180
    const latB = next[1] * Math.PI / 180
    area += lngDelta * (2 + Math.sin(latA) + Math.sin(latB))
  }
  return Math.abs(area * EARTH_RADIUS_KM * EARTH_RADIUS_KM / 2)
}

export function cityAreaKm2(city: CityBoundary) {
  const polygons = city.geometry.type === 'Polygon' ? [city.geometry.coordinates] : city.geometry.coordinates
  return polygons.reduce((total, polygon) => {
    const [outer = [], ...holes] = polygon
    return total + Math.max(0, ringAreaKm2(outer) - holes.reduce((sum, hole) => sum + ringAreaKm2(hole), 0))
  }, 0)
}

function cityBounds(city: CityBoundary) {
  const polygons = city.geometry.type === 'Polygon' ? [city.geometry.coordinates] : city.geometry.coordinates
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        west = Math.min(west, lng)
        south = Math.min(south, lat)
        east = Math.max(east, lng)
        north = Math.max(north, lat)
      }
    }
  }
  return { west, south, east, north }
}

export function discoveredCityPercentage(cells: DiscoveryCell[], city: CityBoundary) {
  const cityArea = cityAreaKm2(city)
  if (!cityArea || cells.length === 0) return 0

  const bounds = cityBounds(city)
  const revealed = new Map<string, number>()
  for (const cell of cells) {
    const [longitude, latitude] = discoveryCellCenter(cell)
    if (
      longitude < bounds.west - .002 || longitude > bounds.east + .002
      || latitude < bounds.south - .002 || latitude > bounds.north + .002
      || !isPointInCity({ lng: longitude, lat: latitude }, city)
    ) continue
    const cellSizeM = EARTH_CIRCUMFERENCE_M * Math.cos(latitude * Math.PI / 180) / 2 ** cell.z
    const range = Math.ceil(DISCOVERY_RADIUS_M / cellSizeM)

    for (let offsetX = -range; offsetX <= range; offsetX += 1) {
      for (let offsetY = -range; offsetY <= range; offsetY += 1) {
        if (Math.hypot(offsetX, offsetY) * cellSizeM > DISCOVERY_RADIUS_M + cellSizeM * .72) continue
        const candidate = { ...cell, x: cell.x + offsetX, y: cell.y + offsetY }
        const [, lat] = discoveryCellCenter(candidate)
        const key = `${candidate.z}/${candidate.x}/${candidate.y}`
        const candidateSizeM = EARTH_CIRCUMFERENCE_M * Math.cos(lat * Math.PI / 180) / 2 ** candidate.z
        revealed.set(key, candidateSizeM * candidateSizeM / 1_000_000)
      }
    }
  }

  const revealedArea = [...revealed.values()].reduce((sum, area) => sum + area, 0)
  return Math.min(100, revealedArea / cityArea * 100)
}

export async function fetchCityBoundary(point: Pick<Coordinate, 'lng' | 'lat'>, signal?: AbortSignal) {
  const query = new URLSearchParams({
    format: 'geojson',
    lat: point.lat.toFixed(5),
    lon: point.lng.toFixed(5),
    zoom: '10',
    polygon_geojson: '1',
    addressdetails: '1',
    layer: 'address',
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
    signal,
    headers: { 'Accept-Language': navigator.language || 'en' },
  })
  if (!response.ok) throw new Error(`City boundary lookup failed (${response.status})`)

  const collection = await response.json() as GeoJSON.FeatureCollection<CityGeometry, {
    osm_type?: string
    osm_id?: number
    name?: string
    display_name?: string
    address?: Record<string, string>
  }>
  const feature = collection.features[0]
  if (!feature || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) {
    throw new Error('OpenStreetMap did not return a municipal boundary for this location')
  }

  const address = feature.properties?.address ?? {}
  const city: CityBoundary = {
    id: `${feature.properties?.osm_type ?? 'osm'}:${feature.properties?.osm_id ?? feature.id ?? 'city'}`,
    name: address.city || address.town || address.municipality || address.village || feature.properties?.name || feature.properties?.display_name?.split(',')[0] || 'Current city',
    geometry: feature.geometry,
    fetchedAt: Date.now(),
  }
  return city
}
