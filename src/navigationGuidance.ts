import type { PlannedRoute } from "./explorationRouting";
import type { RouteProgress } from "./routeProgress";
import { distanceKm } from "./geo";
import { routePositionAtDistance, type RouteGeometry } from "./routeGeometry";

export type TurnSymbol = "straight" | "left" | "right" | "slight-left" | "slight-right" | "sharp-left" | "sharp-right" | "uturn" | "roundabout" | "arrive";
export type RouteManeuver = { instruction: string; symbol: TurnSymbol; fraction: number; roadName: string; endFraction?: number };
export type NavigationCue = { instruction: string; symbol: TurnSymbol; distanceMeters: number };

/** Measures street direction on either side of a junction, rather than following tiny connector edges. */
export function routeContinuesStraight(geometry: RouteGeometry, fraction: number): boolean {
  const total = geometry.distanceKm;
  const at = fraction * total;
  if (at < 0.015 || total - at < 0.015) return false;
  const samples = [at - 0.04, at, at + 0.04].map((target) => routePositionAtDistance(geometry, target));
  const scale = Math.cos(samples[1].lat * Math.PI / 180);
  const incoming = Math.atan2((samples[1].lng - samples[0].lng) * scale, samples[1].lat - samples[0].lat);
  const outgoing = Math.atan2((samples[2].lng - samples[1].lng) * scale, samples[2].lat - samples[1].lat);
  return Math.abs(((outgoing - incoming) * 180 / Math.PI + 540) % 360 - 180) < 25;
}

/** Selects the next provider maneuver using progress along the route, not straight-line distance to a turn. */
export function navigationCue(route: PlannedRoute, progress: RouteProgress): NavigationCue | null {
  if (progress.distanceFromRouteM > 50) return null;
  const next = route.maneuvers.find((maneuver) => (maneuver.endFraction ?? maneuver.fraction) > progress.fraction + 0.00001 && maneuver.symbol !== "straight") ?? route.maneuvers.at(-1);
  if (!next) return null;
  const remainingMeters = Math.max(0, (next.fraction - progress.fraction) * route.distanceKm * 1000);
  if (next.symbol === "arrive" && remainingMeters <= 15) {
    const endpoint = route.points[route.points.length - 1];
    const endpointMeters = distanceKm({ ...progress.position, recordedAt: 0 }, { ...endpoint, recordedAt: 0 }) * 1000;
    return { instruction: next.instruction, symbol: next.symbol, distanceMeters: endpointMeters <= 10 ? 0 : Math.max(15, Math.round(Math.max(remainingMeters, endpointMeters) / 5) * 5) };
  }
  return { instruction: next.instruction, symbol: next.symbol,
    distanceMeters: Math.max(0, Math.round((next.fraction - progress.fraction) * route.distanceKm * 1000 / 5) * 5) };
}

export function maneuverSymbol(type: string, modifier: string): TurnSymbol {
  if (type === "arrive") return "arrive";
  if (type.includes("roundabout") || type.includes("rotary")) return "roundabout";
  switch (modifier) {
    case "left": return "left";
    case "right": return "right";
    case "slight left": return "slight-left";
    case "slight right": return "slight-right";
    case "sharp left": return "sharp-left";
    case "sharp right": return "sharp-right";
    case "uturn": return "uturn";
    case "": case "straight": return "straight";
    default: throw new RangeError(`Unsupported routing maneuver modifier: ${modifier}`);
  }
}
