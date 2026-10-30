import { t } from "./i18n";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CityBoundary } from "./city.ts";
import type { Coordinate, DiscoveryCell } from "./types.ts";

export type StoredDiscovery = { points: Coordinate[]; cells: DiscoveryCell[]; cities: CityBoundary[] };
type WalkCursor = { startedAt: string; id: string };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(t("Discovery history contains an invalid timestamp."));
  return Date.parse(value);
}

function position(value: unknown): GeoJSON.Position {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "number" || typeof value[1] !== "number" ||
      !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
    throw new TypeError(t("Discovery history contains invalid geographic coordinates."));
  }
  return [value[0], value[1]];
}

function ring(value: unknown): GeoJSON.Position[] {
  if (!Array.isArray(value) || value.length < 4) throw new TypeError(t("Discovery history contains an invalid city boundary ring."));
  return value.map(position);
}

function polygon(value: unknown): GeoJSON.Position[][] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(t("Discovery history contains an invalid city polygon."));
  return value.map(ring);
}

export function parseStoredCity(value: unknown): CityBoundary {
  if (!object(value) || typeof value.city_id !== "string" || typeof value.name !== "string" || !object(value.geometry)) {
    throw new TypeError(t("Discovery history contains an invalid city."));
  }
  const source = value.geometry;
  let geometry: CityBoundary["geometry"];
  if (source.type === "Polygon") geometry = { type: "Polygon", coordinates: polygon(source.coordinates) };
  else if (source.type === "MultiPolygon" && Array.isArray(source.coordinates) && source.coordinates.length > 0) {
    geometry = { type: "MultiPolygon", coordinates: source.coordinates.map(polygon) };
  } else throw new TypeError(t("City boundaries must be polygons or multipolygons."));
  const lastDiscoveredAt = timestamp(value.last_discovered_at);
  return { id: value.city_id, name: value.name, geometry, fetchedAt: lastDiscoveredAt,
    firstDiscoveredAt: timestamp(value.first_discovered_at), lastDiscoveredAt };
}

export function parseStoredWalk(value: unknown): { points: Coordinate[]; cursor: WalkCursor } {
  if (!object(value) || typeof value.walk_id !== "string" || typeof value.achievement_eligible !== "boolean" ||
      !Array.isArray(value.coordinates) || value.coordinates.length < 2 || value.coordinates.length > 20000) {
    throw new TypeError(t("Discovery history contains an invalid walk."));
  }
  const startedAt = timestamp(value.started_at);
  const finishedAt = timestamp(value.finished_at);
  if (finishedAt < startedAt) throw new TypeError(t("Discovery history contains a walk ending before it started."));
  const walkId = value.walk_id;
  const eligible = value.achievement_eligible;
  const count = value.coordinates.length;
  const points = value.coordinates.map((point: unknown, index: number): Coordinate => {
    const [lng, lat] = position(point);
    return { lng, lat, recordedAt: startedAt + (finishedAt - startedAt) * index / (count - 1), walkId, achievementEligible: eligible };
  });
  return { points, cursor: { startedAt: value.started_at as string, id: walkId } };
}

export function parseStoredCell(value: unknown): DiscoveryCell {
  if (!object(value) || typeof value.cell_z !== "number" || !Number.isInteger(value.cell_z) || value.cell_z < 0 || value.cell_z > 22 ||
      typeof value.cell_x !== "number" || !Number.isInteger(value.cell_x) || value.cell_x < 0 || value.cell_x >= 2 ** value.cell_z ||
      typeof value.cell_y !== "number" || !Number.isInteger(value.cell_y) || value.cell_y < 0 || value.cell_y >= 2 ** value.cell_z) {
    throw new TypeError(t("Discovery history contains an invalid map cell."));
  }
  return { z: value.cell_z, x: value.cell_x, y: value.cell_y, discoveredAt: timestamp(value.first_discovered_at) };
}

/** Stable pages avoid the hosted API's implicit row cap without truncating an account's history. */
export async function loadStoredWalkPoints(client: SupabaseClient): Promise<Coordinate[]> {
  const points: Coordinate[] = [];
  let cursor: WalkCursor | null = null;
  for (;;) {
    const { data, error } = await client.rpc("get_walk_routes_page", {
      p_after_started_at: cursor?.startedAt ?? null, p_after_id: cursor?.id ?? null, p_limit: 20,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new TypeError(t("The walk-history page response must be an array."));
    for (const row of data) {
      const walk = parseStoredWalk(row);
      points.push(...walk.points);
      cursor = walk.cursor;
    }
    if (data.length < 20) return points;
  }
}

export async function loadStoredCells(client: SupabaseClient): Promise<DiscoveryCell[]> {
  const cells: DiscoveryCell[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("discovery_cells")
      .select("cell_z,cell_x,cell_y,first_discovered_at")
      .order("cell_z").order("cell_x").order("cell_y").range(offset, offset + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new TypeError(t("The discovery-cell page response must be an array."));
    cells.push(...data.map(parseStoredCell));
    if (data.length < 1000) return cells;
  }
}

export async function loadStoredCities(client: SupabaseClient): Promise<CityBoundary[]> {
  const cities: CityBoundary[] = [];
  for (let offset = 0; ; offset += 20) {
    const { data, error } = await client.from("discovered_cities")
      .select("city_id,name,geometry,first_discovered_at,last_discovered_at")
      .order("last_discovered_at", { ascending: false }).order("city_id").range(offset, offset + 19);
    if (error) throw error;
    if (!Array.isArray(data)) throw new TypeError(t("The discovered-city page response must be an array."));
    cities.push(...data.map(parseStoredCity));
    if (data.length < 20) return cities;
  }
}

export async function loadStoredDiscovery(client: SupabaseClient): Promise<StoredDiscovery> {
  const [points, cells, cities] = await Promise.all([loadStoredWalkPoints(client), loadStoredCells(client), loadStoredCities(client)]);
  return { points, cells, cities };
}
