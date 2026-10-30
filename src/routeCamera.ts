import { t } from "./i18n";
import type { Coordinate } from "./types";
import type { RoutePoint } from "./explorationRouting";

/** Uses the user's measured direction, independent of the planned route. */
export function userCameraBearing(point: Coordinate, compassHeading: number | null): number | null {
  const heading = compassHeading ?? point.heading;
  return typeof heading === "number" && Number.isFinite(heading) && heading >= 0 && heading < 360 ? heading : null;
}

export type MapOrientation = "north-up" | "heading-up";

/** North-up is the default; heading-up uses the measured user direction. */
export function mapCameraBearing(orientation: MapOrientation, point: Coordinate, compassHeading: number | null): number | null {
  return orientation === "north-up" ? 0 : userCameraBearing(point, compassHeading);
}

/** Avoids camera redraws after position and direction have already settled. */
export function cameraNeedsUpdate(center: RoutePoint, target: Coordinate, bearing: number, targetBearing: number | null): boolean {
  const positionChanged = Math.hypot(((target.lng - center.lng + 540) % 360 - 180) * Math.cos(target.lat * Math.PI / 180), target.lat - center.lat) * 111_320 > 0.5;
  const directionChanged = targetBearing !== null && Math.abs(((targetBearing - bearing + 540) % 360) - 180) > 1;
  return positionChanged || directionChanged;
}

/** Measures travel direction between two distinct locations. */
export function movementBearing(start: RoutePoint, end: RoutePoint): number {
  if (start.lng === end.lng && start.lat === end.lat) throw new RangeError(t("Travel direction requires two distinct locations."));
  const radians = Math.PI / 180;
  const latitude = (start.lat + end.lat) / 2 * radians;
  return (Math.atan2((end.lng - start.lng) * Math.cos(latitude), end.lat - start.lat) / radians + 360) % 360;
}

type RouteProjection = { index: number; progress: number; distanceSquared: number };

/** Smooths navigation on the shortest longitude and rotation arcs using frame elapsed time. */
export function navigationCameraStep(center: RoutePoint, target: RoutePoint, bearing: number, targetBearing: number, elapsedMs: number): RoutePoint & { bearing: number } {
  const elapsed = Math.max(0, Math.min(50, elapsedMs));
  const positionBlend = 1 - Math.exp(-elapsed / 450);
  const rotationBlend = 1 - Math.exp(-elapsed / 550);
  return {
    lng: center.lng + (((target.lng - center.lng + 540) % 360) - 180) * positionBlend,
    lat: center.lat + (target.lat - center.lat) * positionBlend,
    bearing: bearing + (((targetBearing - bearing + 540) % 360) - 180) * rotationBlend,
  };
}

/** Faces the next meaningful forward stretch, skipping short access connectors and junction geometry. */
export function routeCameraBearing(points: readonly RoutePoint[], origin: RoutePoint): number {
  if (points.length < 2) throw new RangeError(t("A journey camera needs at least two route points."));
  const radians = Math.PI / 180;
  const longitudeScale = Math.cos(origin.lat * radians);
  const projections = points.slice(1).flatMap((end, index): RouteProjection[] => {
    const start = points[index];
    const dx = (end.lng - start.lng) * longitudeScale;
    const dy = end.lat - start.lat;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return [];
    const progress = Math.max(0, Math.min(1, ((origin.lng - start.lng) * longitudeScale * dx + (origin.lat - start.lat) * dy) / lengthSquared));
    const x = (start.lng - origin.lng) * longitudeScale + progress * dx;
    const y = start.lat - origin.lat + progress * dy;
    return [{ index, progress, distanceSquared: x * x + y * y }];
  });
  if (projections.length === 0) throw new RangeError(t("The journey route has no direction ahead of the user."));
  const nearest = projections.reduce((best, projection) => projection.distanceSquared < best.distanceSquared ? projection : best);
  // At a junction, face the outgoing segment rather than the segment that just ended.
  const forward = nearest.progress >= 1
    ? projections.find(({ index }) => index > nearest.index) ?? nearest
    : nearest;
  const segments = projections.filter(({ index }) => index >= forward.index).map(({ index, progress }) => {
    const start = points[index];
    const end = points[index + 1];
    const dx = (end.lng - start.lng) * longitudeScale;
    const dy = end.lat - start.lat;
    return { bearing: (Math.atan2(dx, dy) / radians + 360) % 360,
      lengthM: Math.hypot(dx, dy) * 111_320 * (index === forward.index ? 1 - progress : 1) };
  });
  // A short driveway or junction connector should not turn the camera away from the street ahead.
  let heading = segments[0].bearing;
  let lengthM = 0;
  let longestSegmentM = 0;
  for (const segment of segments) {
    const difference = Math.abs(((segment.bearing - heading + 540) % 360) - 180);
    if (difference > 25) {
      if (lengthM >= 15) return heading;
      heading = segment.bearing;
      lengthM = 0;
      longestSegmentM = 0;
    }
    if (segment.lengthM > longestSegmentM) {
      heading = segment.bearing;
      longestSegmentM = segment.lengthM;
    }
    lengthM += segment.lengthM;
    if (lengthM >= 15) return heading;
  }
  return heading;
}
