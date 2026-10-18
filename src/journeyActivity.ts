import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { discoveredCityPercentage, isPointInCity, type CityBoundary } from "./city";
import { discoveryCellKey, routeDistanceKm } from "./geo";
import type { Coordinate, DiscoveryCell } from "./types";

export type JourneyActivitySnapshot = {
  walkId: string;
  startedAt: number;
  distanceKm: number;
  newAreaPercentage: number | null;
};

export type JourneyStopRequest = { walkId: string; ownerId: string; finishedAt: number };

interface JourneyActivityPlugin {
  start(snapshot: JourneyActivitySnapshot & { ownerId: string }): Promise<void>;
  update(snapshot: JourneyActivitySnapshot): Promise<void>;
  end(snapshot: JourneyActivitySnapshot & { finishedAt: number }): Promise<void>;
  clear(): Promise<void>;
  reconcile(options: { ownerId: string; walkId: string | null }): Promise<void>;
  getStopRequest(options: { ownerId: string; walkId: string }): Promise<{ request: JourneyStopRequest | null }>;
  acknowledgeStop(options: { ownerId: string; walkId: string }): Promise<void>;
  addListener(event: "stopRequested", listener: (request: JourneyStopRequest) => void): Promise<PluginListenerHandle>;
}

export const JourneyActivity = registerPlugin<JourneyActivityPlugin>("JourneyActivity");

/** Uses the recorded route and the same city coverage calculation as the journey panel. */
export function journeyActivitySnapshot(
  walk: { id: string; startedAt: number; points: Coordinate[] },
  startingCells: Set<string>,
  cells: DiscoveryCell[],
  city: CityBoundary | null,
): JourneyActivitySnapshot {
  const point = walk.points.at(-1);
  const currentCity = city && (!point || isPointInCity(point, city)) ? city : null;
  const previousCells = cells.filter((cell) => startingCells.has(discoveryCellKey(cell)));
  return {
    walkId: walk.id,
    startedAt: walk.startedAt,
    distanceKm: routeDistanceKm(walk.points),
    newAreaPercentage: currentCity
      ? Math.max(0, discoveredCityPercentage(cells, currentCity) -
          discoveredCityPercentage(previousCells, currentCity))
      : null,
  };
}

export function journeyActionFromUrl(value: string): { action: "open" | "stop"; walkId: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "hecate:" || url.host !== "journey") return null;
  const walkId = url.searchParams.get("walkId");
  if (!walkId || (url.pathname !== "/open" && url.pathname !== "/stop")) return null;
  return { action: url.pathname === "/stop" ? "stop" : "open", walkId };
}
