import { distanceKm } from "./geo";
import type { RoutePoint } from "./explorationRouting";
import type { RouteGeometry } from "./routeGeometry";

export type RouteProgress = { distanceKm: number; fraction: number; position: RoutePoint; acceptedPosition: RoutePoint; distanceFromRouteM: number };

/** Advances only along nearby route geometry, without jumping ahead at crossings or retreating with GPS jitter. */
export function advanceRouteProgress(geometry: RouteGeometry, position: RoutePoint, previous: RouteProgress): RouteProgress {
  const scale = Math.cos(position.lat * Math.PI / 180);
  const movementKm = distanceKm({ ...previous.acceptedPosition, recordedAt: 0 }, { ...position, recordedAt: 0 });
  const maximumKm = previous.distanceKm + Math.max(0.05, movementKm * 2);
  let closestDistanceM = 50;
  let completedKm = previous.distanceKm;
  let distanceFromRouteM = Infinity;
  for (const { start, end, startKm, lengthKm } of geometry.segments) {
    const dx = (end.lng - start.lng) * scale;
    const dy = end.lat - start.lat;
    const squared = dx * dx + dy * dy;
    if (squared > 0) {
      const progress = Math.max(0, Math.min(1, ((position.lng - start.lng) * scale * dx + (position.lat - start.lat) * dy) / squared));
      const separationM = Math.hypot((start.lng - position.lng) * scale + progress * dx, start.lat - position.lat + progress * dy) * 111_320;
      distanceFromRouteM = Math.min(distanceFromRouteM, separationM);
      const alongKm = startKm + progress * lengthKm;
      if (separationM < closestDistanceM && alongKm >= previous.distanceKm && alongKm <= maximumKm) {
        closestDistanceM = separationM;
        completedKm = alongKm;
      }
    }
  }
  return { distanceKm: completedKm, fraction: Math.min(1, completedKm / geometry.distanceKm), position, acceptedPosition: completedKm > previous.distanceKm ? position : previous.acceptedPosition, distanceFromRouteM };
}
