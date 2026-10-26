import type { RoutePoint } from "./explorationRouting";
import { routePositionAtDistance, type RouteGeometry } from "./routeGeometry";

export function simulationPosition(geometry: RouteGeometry, progress: number): RoutePoint {
  return routePositionAtDistance(geometry, Math.max(0, Math.min(1, progress)) * geometry.distanceKm);
}
