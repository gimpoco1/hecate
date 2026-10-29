import { t } from "./i18n";
import earcut from "earcut";
import { intersectReliefPolygons, smoothReliefPolygons, unionReliefPolygons, type MultiPolygon, type Pair, type Polygon } from "./reliefPolygons";
import { cityPointPredicate, type CityBoundary } from "./city";
import { discoveryCellCenter, discoveryFootprintCells } from "./geo";
import type { DiscoveryCell } from "./types";

export type ReliefFootprint = {
  polygons: MultiPolygon;
  sourceTiles: readonly { x: number; y: number }[];
  gridScale: number;
  centerX: number;
  centerY: number;
  scale: number;
  metresToModel: number;
};

export type ReliefBuilding = { polygons: MultiPolygon; height: number; minHeight: number };
export type CityRelief = {
  groundVertexCount: number;
  positions: Float32Array;
  normals: Float32Array;
  occlusion: Float32Array;
  centerX: number;
  centerY: number;
  scale: number;
};

function mercatorPoint(position: GeoJSON.Position): Pair {
  const [lng, lat] = position;
  return [(lng + 180) / 360, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2];
}

/** Unions reveal cells into their own silhouette, preserving city borders, holes and islands. */
export function createReliefFootprint(cells: readonly DiscoveryCell[], city: CityBoundary): ReliefFootprint {
  const contains = cityPointPredicate(city);
  const cityCells = cells.filter(cell => {
    const [lng, lat] = discoveryCellCenter(cell);
    return contains({ lng, lat });
  });
  if (!cityCells.length) throw new Error(t("This city has no discoveries to render."));
  const xs = cityCells.map(cell => cell.x / 2 ** cell.z);
  const ys = cityCells.map(cell => cell.y / 2 ** cell.z);
  const extent = Math.max(xs.reduce((a, b) => Math.max(a, b)) - xs.reduce((a, b) => Math.min(a, b)), ys.reduce((a, b) => Math.max(a, b)) - ys.reduce((a, b) => Math.min(a, b)), 2 ** -20);
  const zoom = Math.min(20, Math.floor(Math.log2(440 / extent)));
  const gridScale = 2 ** zoom;
  const rows = new Map<number, Set<number>>();
  const sourceTiles = new Map<string, { x: number; y: number }>();
  for (const cell of cityCells) {
    for (const candidate of discoveryFootprintCells(cell)) {
      const [lng, lat] = discoveryCellCenter(candidate);
      if (!contains({ lng, lat })) continue;
      const x = Math.floor(candidate.x / 2 ** candidate.z * gridScale);
      const y = Math.floor(candidate.y / 2 ** candidate.z * gridScale);
      const row = rows.get(y) ?? new Set<number>();
      row.add(x);
      rows.set(y, row);
      const tileX = Math.floor(candidate.x / 2 ** candidate.z * 2 ** 14);
      const tileY = Math.floor(candidate.y / 2 ** candidate.z * 2 ** 14);
      sourceTiles.set(`${tileX}/${tileY}`, { x: tileX, y: tileY });
    }
  }
  const rectangles: MultiPolygon[] = [];
  for (const [y, row] of rows) {
    const ordered = [...row].sort((a, b) => a - b);
    let start = ordered[0];
    for (let index = 1; index <= ordered.length; index += 1) {
      if (ordered[index] === ordered[index - 1] + 1) continue;
      const end = ordered[index - 1] + 1;
      rectangles.push([[[[start, y], [end, y], [end, y + 1], [start, y + 1], [start, y]]]]);
      start = ordered[index];
    }
  }
  const merged = unionReliefPolygons(rectangles.flat());
  const cityPolygons = city.geometry.type === "Polygon" ? [city.geometry.coordinates] : city.geometry.coordinates;
  const boundary: MultiPolygon = cityPolygons.map(polygon => polygon.map(ring => ring.map(position => {
    const [x, y] = mercatorPoint(position);
    return [x * gridScale, y * gridScale];
  })));
  const polygons = intersectReliefPolygons(smoothReliefPolygons(merged), boundary);
  const corners = polygons.flat(2);
  const minX = corners.reduce((value, [x]) => Math.min(value, x), Infinity);
  const maxX = corners.reduce((value, [x]) => Math.max(value, x), -Infinity);
  const minY = corners.reduce((value, [, y]) => Math.min(value, y), Infinity);
  const maxY = corners.reduce((value, [, y]) => Math.max(value, y), -Infinity);
  const centerX = (minX + maxX) / 2 / gridScale;
  const centerY = (minY + maxY) / 2 / gridScale;
  const scale = 2.6 / Math.max(maxX - minX, maxY - minY) * gridScale;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - centerY * 2)));
  const metresToModel = scale / (40075016.686 * Math.cos(latitude));
  return { polygons, sourceTiles: [...sourceTiles.values()], gridScale, centerX, centerY, scale, metresToModel };
}

/** Extrudes mapped building polygons and their courtyards, closed on every side, without a display base. */
export function createCityRelief(footprint: ReliefFootprint, buildings: readonly ReliefBuilding[]): CityRelief {
  const positions: number[] = [];
  const normals: number[] = [];
  const occlusion: number[] = [];
  const toModel = ([x, y]: Pair): Pair => [
    (x / footprint.gridScale - footprint.centerX) * footprint.scale,
    (y / footprint.gridScale - footprint.centerY) * footprint.scale,
  ];
  const vertex = (point: Pair, height: number, normal: readonly number[], shade: number): void => {
    positions.push(point[0], height, point[1]);
    normals.push(...normal);
    occlusion.push(shade);
  };
  const extrude = (polygon: Polygon, low: number, high: number): void => {
    const rings = polygon.map(ring => ring.slice(0, -1).map(toModel));
    const points = rings.flat();
    const holes = rings.slice(1).map((_, index) => rings.slice(0, index + 1).reduce((sum, ring) => sum + ring.length, 0));
    const triangles = earcut(points.flat(), holes, 2);
    for (let index = 0; index < triangles.length; index += 3) {
      const a = points[triangles[index]];
      const b = points[triangles[index + 1]];
      const c = points[triangles[index + 2]];
      const ordered = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0 ? [a, b, c] : [a, c, b];
      for (const point of ordered) vertex(point, high, [0, 1, 0], 1);
      for (const point of [...ordered].reverse()) vertex(point, low, [0, -1, 0], .9);
    }
    for (const [ringIndex, ring] of rings.entries()) {
      const signedArea = ring.reduce((sum, point, index) => {
        const next = ring[(index + 1) % ring.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0);
      const direction = (signedArea > 0 ? 1 : -1) * (ringIndex === 0 ? 1 : -1);
      for (let index = 0; index < ring.length; index += 1) {
        const a = ring[index];
        const b = ring[(index + 1) % ring.length];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        const normal = [dz / length * direction, 0, -dx / length * direction];
        vertex(a, low, normal, .55);
        vertex(b, low, normal, .55);
        vertex(b, high, normal, 1);
        vertex(a, low, normal, .55);
        vertex(b, high, normal, 1);
        vertex(a, high, normal, 1);
      }
    }
  };
  // A paper-thin underside follows only discovered ground, joining the artwork's streets and islands.
  const thickness = Math.min(.004, footprint.metresToModel * 1.5);
  for (const polygon of footprint.polygons) extrude(polygon, -thickness, 0);
  const groundVertexCount = positions.length / 3;
  for (const building of buildings) {
    const clipped = intersectReliefPolygons(building.polygons, footprint.polygons);
    // MapLibre accepts independent floor/roof elevations, including reversed source tags.
    // Preserve their extent while orienting this closed mesh's faces outwards.
    const low = Math.max(0, Math.min(building.minHeight, building.height));
    const high = Math.max(0, building.minHeight, building.height);
    if (low === high) continue;
    for (const polygon of clipped) extrude(polygon, low * footprint.metresToModel, high * footprint.metresToModel);
  }
  return { groundVertexCount, positions: new Float32Array(positions), normals: new Float32Array(normals), occlusion: new Float32Array(occlusion),
    centerX: footprint.centerX, centerY: footprint.centerY, scale: footprint.scale };
}
