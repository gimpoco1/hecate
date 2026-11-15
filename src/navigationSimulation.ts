import { movementBearing } from "./routeCamera";
import type { PlannedRoute, RoutePoint } from "./explorationRouting";
import { advanceRouteProgress } from "./routeProgress";
import { prepareRouteGeometry, routePositionAtDistance, type RouteGeometry } from "./routeGeometry";

export function simulationPosition(geometry: RouteGeometry, progress: number): RoutePoint {
  return routePositionAtDistance(geometry, Math.max(0, Math.min(1, progress)) * geometry.distanceKm);
}

/** Supplies simulated GPS heading from the actual playback path, including the deviation. */
export function simulationHeading(geometry: RouteGeometry, progress: number): number {
  const distance = Math.max(0, Math.min(1, progress)) * geometry.distanceKm;
  const start = routePositionAtDistance(geometry, Math.max(0, distance - 0.001));
  const end = routePositionAtDistance(geometry, Math.min(geometry.distanceKm, distance + 0.001));
  return movementBearing(start, end);
}

export type NavigationPlayback = Pick<PlannedRoute, "points" | "durationSeconds">;

/** Follows the first 50 m, then moves away from all segments to trigger real rerouting. */
export function deviatingNavigationPlayback(route: PlannedRoute): NavigationPlayback {
  const geometry = prepareRouteGeometry(route.points);
  const departureKm = Math.min(0.05, geometry.distanceKm * 0.2);
  const departure = routePositionAtDistance(geometry, departureKm);
  const progress = { distanceKm: departureKm, fraction: departureKm / geometry.distanceKm,
    position: departure, acceptedPosition: departure, distanceFromRouteM: 0 };
  const candidates = Array.from({ length: 8 }, (_, index): RoutePoint => {
    const angle = index * Math.PI / 4;
    return { lng: departure.lng + Math.cos(angle) * 0.0018 / Math.cos(departure.lat * Math.PI / 180),
      lat: departure.lat + Math.sin(angle) * 0.0018 };
  });
  const deviations = candidates.map((point) => ({ point, separation: advanceRouteProgress(geometry, point, progress).distanceFromRouteM }));
  const farthest = deviations.reduce((best, candidate) => candidate.separation > best.separation ? candidate : best);
  if (farthest.separation <= 50) throw new RangeError("The sample route has no clear off-route position within 200 m.");
  const points = [route.points[0], ...geometry.segments.filter(({ endKm }) => endKm < departureKm).map(({ end }) => end), departure, farthest.point];
  return { points, durationSeconds: prepareRouteGeometry(points).distanceKm * 1000 / 1.4 };
}
