import { t } from "./i18n";
import { distanceKm } from "./geo";
import type { RoutePoint } from "./explorationRouting";

export type RouteSegment = { readonly start: RoutePoint; readonly end: RoutePoint; readonly startKm: number; readonly endKm: number; readonly lengthKm: number };
export type RouteGeometry = { readonly segments: readonly RouteSegment[]; readonly distanceKm: number };

/** Computes route distances once for navigation, maneuver analysis, and preview playback. */
export function prepareRouteGeometry(points: readonly RoutePoint[]): RouteGeometry {
  const segments: RouteSegment[] = [];
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const lengthKm = distanceKm({ ...start, recordedAt: 0 }, { ...end, recordedAt: 0 });
    if (lengthKm === 0) continue;
    segments.push({ start, end, startKm: distance, endKm: distance + lengthKm, lengthKm });
    distance += lengthKm;
  }
  if (segments.length === 0) throw new RangeError(t("Navigation needs a route with nonzero distance."));
  return { segments, distanceKm: distance };
}

/** Finds a point in logarithmic time using cumulative segment distances. */
export function routePositionAtDistance(geometry: RouteGeometry, distanceKm: number): RoutePoint {
  const distance = Math.max(0, Math.min(geometry.distanceKm, distanceKm));
  let lower = 0;
  let upper = geometry.segments.length - 1;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (geometry.segments[middle].endKm < distance) lower = middle + 1;
    else upper = middle;
  }
  const segment = geometry.segments[lower];
  if (distance === segment.startKm) return { ...segment.start };
  if (distance === segment.endKm) return { ...segment.end };
  const fraction = (distance - segment.startKm) / segment.lengthKm;
  return { lng: segment.start.lng + (segment.end.lng - segment.start.lng) * fraction,
    lat: segment.start.lat + (segment.end.lat - segment.start.lat) * fraction };
}
