import {
  discoveredDistanceForFootprints,
  discoveryCellAreaKm2,
  discoveryCellCenter,
  discoveryCellKey,
  discoveryFootprintCells,
  discoveryPointsFromCells,
  pointToDiscoveryCell,
} from "./geo";
import type { Coordinate, DiscoveryCell } from "./types";

const EARTH_RADIUS_KM = 6371.0088;

type CityGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export type CityBoundary = {
  id: string;
  name: string;
  geometry: CityGeometry;
  fetchedAt: number;
  firstDiscoveredAt?: number;
  lastDiscoveredAt?: number;
};

// Snapshots of OpenStreetMap relations R175342, R18205773 and R175905. Their polygons
// make the coverage denominator match the metropolitan name shown to users.
const metropolitanRegions = [
  {
    id: "region:greater-london",
    name: "Greater London",
    bounds: [-0.511, 51.286, 0.335, 51.693],
    geometry: () => import("./regions/greater-london.json"),
  },
  {
    id: "region:barcelona-metropolitan",
    name: "Barcelona",
    bounds: [1.846, 41.263, 2.297, 41.535],
    geometry: () => import("./regions/barcelona-metropolitan.json"),
  },
  {
    id: "region:new-york",
    name: "New York",
    bounds: [-74.26, 40.47, -73.7, 40.92],
    geometry: () => import("./regions/new-york.json"),
  },
] as const;

export async function metropolitanCityForPoint(
  point: Pick<Coordinate, "lng" | "lat">,
): Promise<CityBoundary | null> {
  for (const region of metropolitanRegions) {
    const [west, south, east, north] = region.bounds;
    if (
      point.lng < west ||
      point.lng > east ||
      point.lat < south ||
      point.lat > north
    )
      continue;
    const geometry = (await region.geometry()).default as CityGeometry;
    const city: CityBoundary = {
      id: region.id,
      name: region.name,
      geometry,
      fetchedAt: Date.now(),
    };
    if (isPointInCity(point, city)) return city;
  }
  return null;
}

function pointInRing(lng: number, lat: number, ring: GeoJSON.Position[]) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [lngA, latA] = ring[index];
    const [lngB, latB] = ring[previous];
    const crosses =
      latA > lat !== latB > lat &&
      lng < ((lngB - lngA) * (lat - latA)) / (latB - latA) + lngA;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(
  lng: number,
  lat: number,
  polygon: GeoJSON.Position[][],
) {
  if (!polygon.length || !pointInRing(lng, lat, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

export function isPointInCity(
  point: Pick<Coordinate, "lng" | "lat">,
  city: CityBoundary,
) {
  const polygons =
    city.geometry.type === "Polygon"
      ? [city.geometry.coordinates]
      : city.geometry.coordinates;
  return polygons.some((polygon) =>
    pointInPolygon(point.lng, point.lat, polygon),
  );
}

/** Choose a cached region for the map center, preferring a larger named region. */
export function cityForMapCenter(
  point: Pick<Coordinate, "lng" | "lat">,
  cities: CityBoundary[],
) {
  const containing = cities.filter((city) => isPointInCity(point, city));
  return (
    containing.find((city) => city.id.startsWith("region:")) ??
    containing[0] ??
    null
  );
}

export function preferredCityForView(
  viewCenter: Pick<Coordinate, "lng" | "lat"> | null,
  currentCity: CityBoundary | null,
  viewedCity: CityBoundary | null,
  knownCities: CityBoundary[] = [],
): CityBoundary | null {
  if (!viewCenter) return currentCity ?? viewedCity ?? null;
  const candidates = [...knownCities, viewedCity, currentCity].filter(
    (city): city is CityBoundary => city !== null,
  );
  const matching = candidates.filter((city) => isPointInCity(viewCenter, city));
  if (!matching.length) return currentCity ?? viewedCity ?? null;
  return (
    cityForMapCenter(viewCenter, matching) ??
    matching[0] ??
    currentCity ??
    viewedCity ??
    null
  );
}

function ringAreaKm2(ring: GeoJSON.Position[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const lngDelta = ((next[0] - current[0]) * Math.PI) / 180;
    const latA = (current[1] * Math.PI) / 180;
    const latB = (next[1] * Math.PI) / 180;
    area += lngDelta * (2 + Math.sin(latA) + Math.sin(latB));
  }
  return Math.abs((area * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

export function cityAreaKm2(city: CityBoundary) {
  const polygons =
    city.geometry.type === "Polygon"
      ? [city.geometry.coordinates]
      : city.geometry.coordinates;
  return polygons.reduce((total, polygon) => {
    const [outer = [], ...holes] = polygon;
    return (
      total +
      Math.max(
        0,
        ringAreaKm2(outer) -
          holes.reduce((sum, hole) => sum + ringAreaKm2(hole), 0),
      )
    );
  }, 0);
}

function cityBounds(city: CityBoundary) {
  const polygons =
    city.geometry.type === "Polygon"
      ? [city.geometry.coordinates]
      : city.geometry.coordinates;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }
  }
  return { west, south, east, north };
}

export async function canonicalCityForStoredBoundary(
  city: CityBoundary,
): Promise<CityBoundary> {
  const { west, south, east, north } = cityBounds(city);
  const center = { lng: (west + east) / 2, lat: (south + north) / 2 };
  const region = await metropolitanCityForPoint(center);
  return region
    ? {
        ...region,
        firstDiscoveredAt: city.firstDiscoveredAt,
        lastDiscoveredAt: city.lastDiscoveredAt,
      }
    : city;
}

export function discoveredCityAreaKm2(
  cells: DiscoveryCell[],
  city: CityBoundary,
) {
  if (cells.length === 0) return 0;
  const bounds = cityBounds(city);
  const revealed = new Map<string, number>();
  for (const cell of cells) {
    const [longitude, latitude] = discoveryCellCenter(cell);
    if (
      longitude < bounds.west - 0.002 ||
      longitude > bounds.east + 0.002 ||
      latitude < bounds.south - 0.002 ||
      latitude > bounds.north + 0.002 ||
      !isPointInCity({ lng: longitude, lat: latitude }, city)
    )
      continue;
    for (const candidate of discoveryFootprintCells(cell)) {
      const [lng, lat] = discoveryCellCenter(candidate);
      // Coverage is the overlap with this municipality, not the whole
      // circular reveal around a route point near its boundary.
      if (!isPointInCity({ lng, lat }, city)) continue;
      const key = discoveryCellKey(candidate);
      revealed.set(key, discoveryCellAreaKm2(candidate));
    }
  }

  return [...revealed.values()].reduce((sum, area) => sum + area, 0);
}

export function discoveredCityPercentage(
  cells: DiscoveryCell[],
  city: CityBoundary,
) {
  const cityArea = cityAreaKm2(city);
  if (!cityArea || cells.length === 0) return 0;

  const revealedArea = discoveredCityAreaKm2(cells, city);
  return Math.min(100, (revealedArea / cityArea) * 100);
}

/** Distance that unlocked new reveal cells within one city region. */
export function discoveredCityDistanceKm(
  points: Coordinate[],
  city: CityBoundary,
) {
  return discoveredDistanceForFootprints(points, (point) => {
    if (!isPointInCity(point, city)) return [];
    return discoveryFootprintCells(pointToDiscoveryCell(point)).filter(
      (cell) => {
        const [lng, lat] = discoveryCellCenter(cell);
        return isPointInCity({ lng, lat }, city);
      },
    );
  });
}

/**
 * City distance based on the persisted discovery-cell history. This is the
 * value shown in the app, so the map and its kilometre total stay in sync on
 * every device.
 */
export function discoveredCityCellDistanceKm(
  cells: DiscoveryCell[],
  city: CityBoundary,
) {
  return discoveredCityDistanceKm(discoveryPointsFromCells(cells), city);
}

export async function fetchCityBoundary(
  point: Pick<Coordinate, "lng" | "lat">,
  signal?: AbortSignal,
) {
  const metropolitan = await metropolitanCityForPoint(point);
  if (signal?.aborted)
    throw new DOMException("City boundary lookup was cancelled", "AbortError");
  if (metropolitan) return metropolitan;
  const query = new URLSearchParams({
    format: "geojson",
    lat: point.lat.toFixed(5),
    lon: point.lng.toFixed(5),
    zoom: "10",
    polygon_geojson: "1",
    addressdetails: "1",
    layer: "address",
  });
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${query}`,
    {
      signal,
      headers: { "Accept-Language": navigator.language || "en" },
    },
  );
  if (!response.ok)
    throw new Error(`City boundary lookup failed (${response.status})`);

  const collection = (await response.json()) as GeoJSON.FeatureCollection<
    CityGeometry,
    {
      osm_type?: string;
      osm_id?: number;
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    }
  >;
  const feature = collection.features[0];
  if (
    !feature ||
    (feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "MultiPolygon")
  ) {
    throw new Error(
      "OpenStreetMap did not return a municipal boundary for this location",
    );
  }

  const address = feature.properties?.address ?? {};
  const city: CityBoundary = {
    id: `${feature.properties?.osm_type ?? "osm"}:${feature.properties?.osm_id ?? feature.id ?? "city"}`,
    name:
      feature.properties?.name ||
      address.city ||
      address.town ||
      address.municipality ||
      address.village ||
      feature.properties?.display_name?.split(",")[0] ||
      "Current city",
    geometry: feature.geometry,
    fetchedAt: Date.now(),
  };
  if (!isPointInCity(point, city))
    throw new Error(
      "The returned city boundary does not contain this location",
    );
  return city;
}
