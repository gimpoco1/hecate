import earcut from "earcut";
import { MercatorCoordinate } from "maplibre-gl";
import type { Geometry, Position } from "geojson";

export type FogWaterMesh = {
  x: number;
  y: number;
  vertices: Float32Array;
};

export const FOG_WATER_ZOOM = 12;
const TILE_COUNT = 2 ** FOG_WATER_ZOOM;
const TILE_EXTENT = 8192;

function waterCoordinate(position: Position): MercatorCoordinate {
  const [lng, lat] = position;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new RangeError("Water polygon contains a non-finite longitude or latitude.");
  }
  return MercatorCoordinate.fromLngLat({ lng, lat: Math.max(-85.05112878, Math.min(85.05112878, lat)) });
}

/** Tile-local triangles preserve coastlines and island holes at street-level zoom. */
export function fogWaterMeshes(geometries: readonly Geometry[]): FogWaterMesh[] {
  const buckets = new Map<string, { x: number; y: number; vertices: number[] }>();
  for (const geometry of geometries) {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      if (!polygon[0]?.length) continue;
      const origin = waterCoordinate(polygon[0][0]);
      const x = Math.max(0, Math.min(TILE_COUNT - 1, Math.floor(origin.x * TILE_COUNT)));
      const y = Math.max(0, Math.min(TILE_COUNT - 1, Math.floor(origin.y * TILE_COUNT)));
      const coordinates: number[] = [];
      const holes: number[] = [];
      for (const [index, ring] of polygon.entries()) {
        if (index > 0) holes.push(coordinates.length / 2);
        for (const position of ring) {
          const point = waterCoordinate(position);
          coordinates.push((point.x * TILE_COUNT - x) * TILE_EXTENT, (point.y * TILE_COUNT - y) * TILE_EXTENT);
        }
      }
      const indices = earcut(coordinates, holes, 2);
      const key = `${x}:${y}`;
      const bucket = buckets.get(key) ?? { x, y, vertices: [] };
      for (const index of indices) bucket.vertices.push(coordinates[index * 2], coordinates[index * 2 + 1]);
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].map(({ x, y, vertices }) => ({ x, y, vertices: new Float32Array(vertices) }));
}
