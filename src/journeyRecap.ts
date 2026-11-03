import { discoveryCellsFromPoints, discoveryJourneyMetrics, mergeRoutePoints } from "./geo";
import type { Coordinate, DiscoveryCell, PendingWalk } from "./types";

export type JourneyRecapRoute = {
  points: Coordinate[];
  newGroundSegments: Coordinate[][];
  cells: DiscoveryCell[];
  bounds: { west: number; east: number; south: number; north: number };
};

/** Prepare and validate recap geometry before publishing it to React state. */
export function createJourneyRecapRoute(history: Coordinate[], completed: PendingWalk): JourneyRecapRoute {
  if (!completed.id || completed.points.length < 2) {
    throw new RangeError("A journey recap requires a journey ID and at least two recorded points.");
  }
  const points = completed.points.map(point => ({ ...point, walkId: completed.id }));
  const journey = discoveryJourneyMetrics(mergeRoutePoints(history, points))
    .find(candidate => candidate.journeyId === completed.id);
  if (!journey) throw new Error(`Could not prepare recap geometry for journey ${completed.id}.`);
  const first = journey.points[0];
  const bounds = journey.points.reduce((current, point) => ({
    west: Math.min(current.west, point.lng), east: Math.max(current.east, point.lng),
    south: Math.min(current.south, point.lat), north: Math.max(current.north, point.lat),
  }), { west: first.lng, east: first.lng, south: first.lat, north: first.lat });
  return { points: journey.points, newGroundSegments: journey.newGroundSegments, bounds, cells: discoveryCellsFromPoints(journey.points) };
}
