import { backtrackedDistanceKm, closedRouteLoops } from "./routeQuality";
import { discoveredDistanceForFootprints, discoveryCellKey, discoveryFootprintCells, distanceKm, pointToDiscoveryCell } from "./geo";
import type { Coordinate, DiscoveryCell } from "./types";
import { maneuverSymbol, routeContinuesStraight, type RouteManeuver } from "./navigationGuidance";
import { combineCrossingManeuvers, type JunctionManeuver } from "./junctionManeuvers";
import { prepareRouteGeometry, type RouteGeometry } from "./routeGeometry";

export type TransportMode = "pedestrian" | "bicycle";
export type RoutePoint = { lng: number; lat: number };
export type PlannedRoute = {
  id: string;
  points: RoutePoint[];
  maneuvers: RouteManeuver[];
  distanceKm: number;
  durationSeconds: number;
  newGroundKm: number;
  backtrackedKm: number;
  unproductiveLoopKm: number;
};
export type RoutePlan = { extraMinutes: number; mode: TransportMode; origin: RoutePoint; destination: RoutePoint; routes: PlannedRoute[] };
export const ROUTE_BUDGETS: readonly number[] = [5, 10, 20];
const ROUTER_URL = import.meta.env.VITE_WALKING_ROUTER_URL || "https://valhalla1.openstreetmap.de/route";

export class ExplorationRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplorationRoutingError";
  }
}

export class DestinationTooCloseError extends ExplorationRoutingError {
  constructor() {
    super("Choose somewhere at least 100 m away. Tap another point on the map or search for a different place.");
    this.name = "DestinationTooCloseError";
  }
}

export class RouteDistanceExceededError extends ExplorationRoutingError {
  constructor(readonly status: number, readonly responseBody: string, readonly locations: readonly RoutePoint[]) {
    super("This journey exceeds the routing service’s distance limit. Choose a closer destination.");
    this.name = "RouteDistanceExceededError";
  }
}

class RouteRequestError extends ExplorationRoutingError {
  constructor(readonly status: number, body: string, locations: readonly RoutePoint[]) {
    super(`Route request failed (${status}): ${body}. Locations: ${JSON.stringify(locations)}`);
    this.name = "RouteRequestError";
  }
}

function coordinate(point: RoutePoint): Coordinate {
  return { ...point, recordedAt: 0 };
}

/** Estimates newly revealed distance using the same footprint and credit cap as recorded walks. */
export function estimateRouteDiscovery(points: readonly RoutePoint[], cells: readonly DiscoveryCell[]): number {
  const known = new Set(cells.flatMap(discoveryFootprintCells).map(discoveryCellKey));
  return routeDiscovery(points, known);
}

function routeDiscovery(points: readonly RoutePoint[], known: ReadonlySet<string>): number {
  const preview = points.map((point, index): Coordinate => ({
    ...point, recordedAt: index, walkId: "route-preview",
  }));
  return discoveredDistanceForFootprints(preview, (point) =>
    discoveryFootprintCells(pointToDiscoveryCell(point))
      .filter((cell) => !known.has(discoveryCellKey(cell))),
  );
}

type UnscoredRoute = Omit<PlannedRoute, "newGroundKm" | "unproductiveLoopKm">;

function scoreRoute(route: UnscoredRoute, id: string, known: ReadonlySet<string>): PlannedRoute {
  const newGroundKm = routeDiscovery(route.points, known);
  const unproductiveLoopKm = closedRouteLoops(route.points).reduce((total, loop) => {
    const before = routeDiscovery(route.points.slice(0, loop.startIndex + 1), known);
    const after = routeDiscovery(route.points.slice(0, loop.endIndex + 1), known);
    return total + (after - before < loop.distanceKm * 0.5 ? loop.distanceKm : 0);
  }, 0);
  return { ...route, id, newGroundKm, unproductiveLoopKm };
}

/** Rewards new ground and charges for travelling through already discovered areas. */
function discoveryBenefit(route: Pick<PlannedRoute, "newGroundKm" | "distanceKm">): number {
  return route.newGroundKm - Math.max(0, route.distanceKm - route.newGroundKm);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseManeuvers(legs: unknown, distanceMeters: number, geometry: RouteGeometry): RouteManeuver[] {
  if (!Array.isArray(legs) || legs.length === 0) throw new ExplorationRoutingError("Routing service returned no maneuver legs.");
  let offsetMeters = 0;
  const steps = legs.flatMap((leg: unknown) => {
    if (!object(leg) || !Array.isArray(leg.steps) || leg.steps.length === 0) throw new ExplorationRoutingError("Routing service returned no maneuver steps.");
    return leg.steps.map((step: unknown): JunctionManeuver => {
      if (!object(step) || typeof step.distance !== "number" || !Number.isFinite(step.distance) || step.distance < 0 ||
        !object(step.maneuver) || typeof step.maneuver.instruction !== "string" || !step.maneuver.instruction.trim() || typeof step.maneuver.type !== "string" ||
        (step.maneuver.modifier !== undefined && typeof step.maneuver.modifier !== "string") ||
        (step.name !== undefined && typeof step.name !== "string")) {
        throw new ExplorationRoutingError(`Routing service returned an invalid maneuver: ${JSON.stringify(step)}`);
      }
      const roadName = (step.name ?? "").trim();
      const keepOnRoad = /^Keep (?:left|right) to stay on /i.test(step.maneuver.instruction);
      const maneuver: RouteManeuver = { roadName,
        instruction: keepOnRoad ? step.maneuver.instruction.replace(/^Keep (?:left|right) to stay on /i, "Stay on ") : step.maneuver.instruction,
        symbol: maneuverSymbol(step.maneuver.type, step.maneuver.modifier ?? ""), fraction: Math.min(1, offsetMeters / distanceMeters) };
      offsetMeters += step.distance;
      const bearings = [step.maneuver.bearing_before, step.maneuver.bearing_after].map((value: unknown): number | null => {
        if (value === undefined) return null;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 360) throw new ExplorationRoutingError(`Invalid maneuver bearing: ${JSON.stringify(value)}`);
        return value;
      });
      return { maneuver, type: step.maneuver.type, bearingBefore: bearings[0], bearingAfter: bearings[1] };
    });
  });
  const combined = combineCrossingManeuvers(steps, distanceMeters);
  return combined.map(({ maneuver, type, bearingBefore, bearingAfter }, index): RouteManeuver => {
    const junctionTurn = ["turn", "continue", "end of road"].includes(type) &&
      ["left", "right", "slight-left", "slight-right"].includes(maneuver.symbol);
    const sameStreet = maneuver.roadName !== "" && maneuver.roadName === combined[index - 1]?.maneuver.roadName;
    const locallyStraight = bearingBefore !== null && bearingAfter !== null && Math.abs(((bearingAfter - bearingBefore + 540) % 360) - 180) < 25;
    return maneuver.endFraction === undefined && junctionTurn && (sameStreet || locallyStraight) && routeContinuesStraight(geometry, maneuver.fraction)
      ? { ...maneuver, symbol: "straight", instruction: maneuver.roadName ? `Stay on ${maneuver.roadName}.` : "Continue straight." }
      : maneuver;
  });
}

/** Parses only fields needed for previews; invalid provider data fails explicitly. */
export function parsePlannedRoutes(value: unknown): Omit<PlannedRoute, "newGroundKm" | "unproductiveLoopKm">[] {
  if (!object(value) || value.code !== "Ok" || !Array.isArray(value.routes) || value.routes.length === 0) {
    throw new ExplorationRoutingError(`Routing service returned no usable routes: ${JSON.stringify(value)}`);
  }
  return value.routes.map((route: unknown, index: number) => {
    if (!object(route) || typeof route.distance !== "number" || !Number.isFinite(route.distance) || route.distance <= 0 ||
      typeof route.duration !== "number" || !Number.isFinite(route.duration) || route.duration <= 0 ||
      !object(route.geometry) || route.geometry.type !== "LineString" || !Array.isArray(route.geometry.coordinates) ||
      route.geometry.coordinates.length < 2) {
      throw new ExplorationRoutingError(`Routing service returned invalid route ${index}: ${JSON.stringify(route)}`);
    }
    const points = route.geometry.coordinates.map((position: unknown): RoutePoint => {
      if (!Array.isArray(position) || position.length < 2 || typeof position[0] !== "number" ||
        typeof position[1] !== "number" || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) ||
        Math.abs(position[0]) > 180 || Math.abs(position[1]) > 85) {
        throw new ExplorationRoutingError(`Route ${index} contains invalid coordinates: ${JSON.stringify(position)}`);
      }
      return { lng: position[0], lat: position[1] };
    });
    return { id: `route-${index}`, points, maneuvers: parseManeuvers(route.legs, route.distance, prepareRouteGeometry(points)), distanceKm: route.distance / 1_000, durationSeconds: route.duration, backtrackedKm: backtrackedDistanceKm(points) };
  });
}

async function requestRoutes(locations: readonly RoutePoint[], mode: TransportMode, signal: AbortSignal): Promise<Omit<PlannedRoute, "newGroundKm" | "unproductiveLoopKm">[]> {
  const params = {
    locations: locations.map(({ lat, lng }, index) => ({
      lat, lon: lng, radius: 50, type: index === 0 || index === locations.length - 1 ? "break" : "through",
    })),
    costing: mode, format: "osrm", shape_format: "geojson", directions_type: "instructions", language: "en-US", alternates: locations.length === 2 ? 2 : 0,
    costing_options: mode === "pedestrian"
      ? { pedestrian: { walking_speed: 5.1 } }
      : { bicycle: { bicycle_type: "hybrid" } },
  };
  const url = new URL(ROUTER_URL);
  url.searchParams.set("json", JSON.stringify(params));
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (signal.aborted) throw new DOMException("Route planning was cancelled.", "AbortError");
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    try {
      const response = await fetch(url, { headers: { "X-Client-Id": "hecate" }, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text();
        const details: unknown = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(body) : null;
        if (response.status === 400 && object(details) && details.code === "DistanceExceeded") {
          throw new RouteDistanceExceededError(response.status, body, locations);
        }
        if (response.status === 400 && object(details) && (details.error_code === 442 || details.error_code === 171 || details.code === "NoRoute")) {
          console.warn("No route through requested locations", { locations, mode, status: response.status, body });
          return [];
        }
        throw new RouteRequestError(response.status, body, locations);
      }
      const routes = parsePlannedRoutes(await response.json());
      const origin = locations[0];
      const destination = locations[locations.length - 1];
      for (const route of routes) {
        if (distanceKm(coordinate(origin), coordinate(route.points[0])) > 0.15 ||
          distanceKm(coordinate(destination), coordinate(route.points[route.points.length - 1])) > 0.15) {
          throw new ExplorationRoutingError("No accessible path within 150 m of the chosen start or destination. Choose a point closer to a street or path.");
        }
      }
      return routes;
    } catch (error) {
      if (signal.aborted || (!timedOut && !(error instanceof TypeError) &&
        !(error instanceof RouteRequestError && error.status >= 500))) throw error;
      const failure = timedOut
        ? new ExplorationRoutingError(`Route request timed out after 20 seconds. Check your connection and try again. Locations: ${JSON.stringify(locations)}`)
        : error instanceof TypeError
          ? new ExplorationRoutingError(`Could not contact the routing service. Check your internet connection and try again. Endpoint: ${url.origin}. Locations: ${JSON.stringify(locations)}. Cause: ${error.message}`)
          : error;
      if (attempt === 2) throw failure;
      console.warn("Route request failed; retrying", { locations, mode, attempt, error: failure });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  }
  throw new ExplorationRoutingError("Route request exhausted its attempts.");
}

type DetourCorridor = { entry: number; exit: number };
const DETOUR_CORRIDORS: readonly DetourCorridor[] = [
  { entry: 0.3, exit: 0.7 },
  { entry: 0.15, exit: 0.45 },
  { entry: 0.55, exit: 0.85 },
];

/** Widens long detours so nearby destinations do not produce narrow out-and-back routes. */
function detourAlongKm(separationKm: number, offsetKm: number, fraction: number): number {
  return separationKm * fraction + (fraction - 0.5) * 2 * Math.max(0, offsetKm - separationKm / 2);
}

/** Fits a broad detour with separate entry and exit points to the requested extra time. */
function detourOffsetKm(separationKm: number, baselineSeconds: number, extraMinutes: number, corridor: DetourCorridor): number {
  const targetLength = separationKm * (1 + extraMinutes * 60 / baselineSeconds);
  let lower = 0;
  let upper = targetLength / 2;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const offset = (lower + upper) / 2;
    const entry = detourAlongKm(separationKm, offset, corridor.entry);
    const exit = detourAlongKm(separationKm, offset, corridor.exit);
    const length = Math.hypot(entry, offset) + exit - entry + Math.hypot(separationKm - exit, offset);
    if (length < targetLength) lower = offset;
    else upper = offset;
  }
  return (lower + upper) / 2;
}

function detourPoint(origin: RoutePoint, destination: RoutePoint, offsetKm: number, side: number, fraction: number): RoutePoint {
  const longitudeScale = Math.cos((origin.lat + destination.lat) / 2 * Math.PI / 180);
  const dx = (destination.lng - origin.lng) * longitudeScale;
  const dy = destination.lat - origin.lat;
  const length = Math.hypot(dx, dy);
  const offset = offsetKm / 111.32;
  const along = detourAlongKm(length * 111.32, offsetKm, fraction) / (length * 111.32);
  return {
    lng: origin.lng + (destination.lng - origin.lng) * along - side * dy / length * offset / longitudeScale,
    lat: origin.lat + (destination.lat - origin.lat) * along + side * dx / length * offset,
  };
}

type DiscoveryDetour = { corridor: DetourCorridor; side: number; offsetKm: number; benefit: number };
type DetourSearch = { routes: PlannedRoute[]; strategy: DiscoveryDetour; strategyIndex: number; nextOffsetKm: number; closestTimeGap: number };

function discoveryGuidedDetours(
  origin: RoutePoint,
  destination: RoutePoint,
  separationKm: number,
  baselineSeconds: number,
  extraMinutes: number,
  known: ReadonlySet<string>,
): DiscoveryDetour[] {
  return DETOUR_CORRIDORS.flatMap((corridor) => [-1, 1].map((side) => {
    const initialOffset = detourOffsetKm(separationKm, baselineSeconds, extraMinutes, corridor);
    const positions = [0.8, 1, 1.2].map((scale): DiscoveryDetour => {
      const offsetKm = initialOffset * scale;
      const points = [origin,
        detourPoint(origin, destination, offsetKm, side, corridor.entry),
        detourPoint(origin, destination, offsetKm, side, corridor.exit), destination];
      const length = points.slice(1).reduce((sum, point, index) => sum + distanceKm(coordinate(points[index]), coordinate(point)), 0);
      const samples = points.slice(1).flatMap((point, index) => {
        const start = points[index];
        const steps = Math.max(1, Math.ceil(distanceKm(coordinate(start), coordinate(point)) / 0.1));
        return Array.from({ length: steps }, (_, step) => ({
          lng: start.lng + (point.lng - start.lng) * (step + 1) / steps,
          lat: start.lat + (point.lat - start.lat) * (step + 1) / steps,
        }));
      });
      const newGroundKm = routeDiscovery([origin, ...samples], known);
      return { corridor, side, offsetKm, benefit: discoveryBenefit({ newGroundKm, distanceKm: length }) / length };
    });
    return positions.sort((a, b) => b.benefit - a.benefit || Math.abs(a.offsetKm - initialOffset) - Math.abs(b.offsetKm - initialOffset))[0];
  })).sort((a, b) => b.benefit - a.benefit);
}

function extraTimeToleranceSeconds(extraMinutes: number): number {
  return Math.min(120, extraMinutes * 60 * 0.2);
}

function isUsefulDiscoveryRoute(route: PlannedRoute, baseline: PlannedRoute, extraMinutes: number): boolean {
  return Math.abs(route.durationSeconds - baseline.durationSeconds - extraMinutes * 60) <= extraTimeToleranceSeconds(extraMinutes) &&
    hasDiscoveryGain(route, baseline);
}

function hasDiscoveryGain(route: PlannedRoute, baseline: PlannedRoute): boolean {
  return route.newGroundKm >= baseline.newGroundKm + 0.1 &&
    route.backtrackedKm <= baseline.backtrackedKm + 0.025 &&
    route.unproductiveLoopKm <= baseline.unproductiveLoopKm + 0.025;
}

function isMiddleRoute(route: PlannedRoute, baseline: PlannedRoute, longest: PlannedRoute): boolean {
  const extraDistance = longest.distanceKm - baseline.distanceKm;
  const fraction = (route.distanceKm - baseline.distanceKm) / extraDistance;
  return extraDistance >= 0.2 && fraction >= 0.3 && fraction <= 0.7 &&
    route.durationSeconds > baseline.durationSeconds + 30 && route.durationSeconds < longest.durationSeconds - 30 &&
    hasDiscoveryGain(route, baseline);
}

export async function calculateDirectRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  cells: readonly DiscoveryCell[],
  mode: TransportMode,
  signal: AbortSignal,
): Promise<RoutePlan> {
  validateDestination(origin, destination);
  const routes = await requestRoutes([origin, destination], mode, signal);
  if (routes.length === 0) throw new ExplorationRoutingError("No accessible direct route found for this transport mode.");
  const fastest = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
  const known = new Set(cells.flatMap(discoveryFootprintCells).map(discoveryCellKey));
  return { origin, destination, mode, extraMinutes: 0, routes: [scoreRoute(fastest, "direct", known)] };
}

function validateDestination(origin: RoutePoint, destination: RoutePoint): number {
  const separationKm = distanceKm(coordinate(origin), coordinate(destination));
  if (separationKm < 0.1) throw new DestinationTooCloseError();
  return separationKm;
}

export async function calculateExplorationRoutes(
  origin: RoutePoint,
  destination: RoutePoint,
  cells: readonly DiscoveryCell[],
  mode: TransportMode,
  extraMinutes: number,
  signal: AbortSignal,
): Promise<RoutePlan> {
  if (!ROUTE_BUDGETS.includes(extraMinutes)) throw new ExplorationRoutingError("Choose an extra-time target of 5, 10, or 20 minutes.");
  const direct = await calculateDirectRoute(origin, destination, cells, mode, signal);
  return findExplorationRoutes(direct, cells, extraMinutes, signal, () => {});
}

/** Publishes usable suggestions as they arrive while comparing corridors with at most three concurrent requests. */
export async function findExplorationRoutes(
  direct: RoutePlan,
  cells: readonly DiscoveryCell[],
  extraMinutes: number,
  signal: AbortSignal,
  onRoutesFound: (plan: RoutePlan) => void,
): Promise<RoutePlan> {
  if (!ROUTE_BUDGETS.includes(extraMinutes)) throw new ExplorationRoutingError("Choose an extra-time target of 5, 10, or 20 minutes.");
  const { origin, destination, mode } = direct;
  const separationKm = validateDestination(origin, destination);
  const known = new Set(cells.flatMap(discoveryFootprintCells).map(discoveryCellKey));
  const baseline = scoreRoute(direct.routes[0], "direct", known);
  const strategies = discoveryGuidedDetours(origin, destination, separationKm, baseline.durationSeconds, extraMinutes, known);
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const available: PlannedRoute[] = [];
  let publishedIds = "";
  const publish = (routes: readonly PlannedRoute[]): void => {
    if (controller.signal.aborted || routes.length === 0) return;
    available.push(...routes);
    const plan: RoutePlan = { mode, extraMinutes, origin, destination, routes: [baseline, ...available] };
    const suggestions = routesForExtraTime(plan);
    const ids = suggestions.map(({ id }) => id).join(",");
    if (suggestions.length > 1 && ids !== publishedIds) {
      publishedIds = ids;
      onRoutesFound(plan);
    }
  };
  try {
    const batches = await Promise.all(Array.from({ length: 3 }, async (_, lane): Promise<DetourSearch[]> => {
      const results: DetourSearch[] = [];
      for (let index = lane; index < strategies.length; index += 3) {
        results.push(await searchDetour(strategies[index], index, baseline, direct, extraMinutes, known, controller.signal, publish));
      }
      return results;
    }));
    const searches = batches.flat();
    const candidates = searches.flatMap(({ routes }) => routes);
    if (!candidates.some((route) => isUsefulDiscoveryRoute(route, baseline, extraMinutes))) {
      // Refine the most promising corridors once more only when the initial search has no usable suggestion.
      const refinements = await Promise.all([...searches].sort((a, b) => a.closestTimeGap - b.closestTimeGap).slice(0, 3).map(async (search): Promise<PlannedRoute[]> => {
        const { corridor, side } = search.strategy;
        const entry = detourPoint(origin, destination, search.nextOffsetKm, side, corridor.entry);
        const exit = detourPoint(origin, destination, search.nextOffsetKm, side, corridor.exit);
        const routes = await requestRoutes([origin, entry, exit, destination], mode, controller.signal);
        const scored = routes.filter((route) => Math.abs(route.durationSeconds - baseline.durationSeconds - extraMinutes * 60) <= extraTimeToleranceSeconds(extraMinutes))
          .map((route, index) => scoreRoute(route, `refinement-${search.strategyIndex}-${index}`, known));
        publish(scored);
        return scored;
      }));
      candidates.push(...refinements.flat());
    }
    const plan = { mode, extraMinutes, origin, destination, routes: [baseline, ...candidates] };
    const suggestions = routesForExtraTime(plan);
    if (suggestions.length === 2) {
      const halfExtraMinutes = (suggestions[1].durationSeconds - baseline.durationSeconds) / 120;
      const middleStrategies = discoveryGuidedDetours(origin, destination, separationKm, baseline.durationSeconds, halfExtraMinutes, known).slice(0, 2);
      const middleSearches = await Promise.all(middleStrategies.map((strategy, index) =>
        searchDetour(strategy, strategies.length + index, baseline, direct, halfExtraMinutes, known, controller.signal, publish),
      ));
      return { ...plan, routes: [...plan.routes, ...middleSearches.flatMap(({ routes }) => routes)] };
    }
    return plan;
  } finally {
    controller.abort();
    signal.removeEventListener("abort", cancel);
  }
}

async function searchDetour(
  strategy: DiscoveryDetour,
  strategyIndex: number,
  baseline: PlannedRoute,
  direct: RoutePlan,
  extraMinutes: number,
  known: ReadonlySet<string>,
  signal: AbortSignal,
  onCandidates: (routes: readonly PlannedRoute[]) => void,
): Promise<DetourSearch> {
  const { origin, destination, mode } = direct;
  const { corridor, side } = strategy;
  const targetExtraSeconds = extraMinutes * 60;
  const scored: PlannedRoute[] = [];
  let offset = strategy.offsetKm;
  let lower = 0;
  let upper = Infinity;
  let lowerSeconds = 0;
  let upperSeconds = Infinity;
  let closestTimeGap = Infinity;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entry = detourPoint(origin, destination, offset, side, corridor.entry);
    const exit = detourPoint(origin, destination, offset, side, corridor.exit);
    const routes = await requestRoutes([origin, entry, exit, destination], mode, signal);
    // Keep shorter candidates too, so the second suggestion can sit between direct and the full detour.
    const candidates = routes
      .filter((route) => route.durationSeconds > baseline.durationSeconds + 30 && route.durationSeconds <= baseline.durationSeconds + targetExtraSeconds + extraTimeToleranceSeconds(extraMinutes))
      .map((route, index) => scoreRoute(route, `detour-${strategyIndex}-${attempt}-${index}`, known));
    scored.push(...candidates);
    onCandidates(candidates);
    if (candidates.some((route) => isUsefulDiscoveryRoute(route, baseline, extraMinutes))) break;
    if (routes.length === 0) {
      upper = offset;
      upperSeconds = Infinity;
      offset = (lower + upper) / 2;
      continue;
    }
    const closest = [...routes].sort((a, b) =>
      Math.abs(a.durationSeconds - baseline.durationSeconds - targetExtraSeconds) -
      Math.abs(b.durationSeconds - baseline.durationSeconds - targetExtraSeconds),
    )[0];
    const extraSeconds = closest.durationSeconds - baseline.durationSeconds;
    closestTimeGap = Math.min(closestTimeGap, Math.abs(extraSeconds - targetExtraSeconds));
    // A matching ETA is insufficient when the route retraces streets or reveals too little new ground.
    if (Math.abs(extraSeconds - targetExtraSeconds) <= extraTimeToleranceSeconds(extraMinutes)) {
      offset *= 1.15;
      continue;
    }
    if (extraSeconds > targetExtraSeconds) {
      upper = offset;
      upperSeconds = extraSeconds;
    } else {
      lower = offset;
      lowerSeconds = extraSeconds;
    }
    // Interpolate measured travel times instead of repeatedly bisecting the geographic distance.
    if (Number.isFinite(upper)) {
      const fraction = Number.isFinite(upperSeconds)
        ? Math.max(0.2, Math.min(0.8, (targetExtraSeconds - lowerSeconds) / (upperSeconds - lowerSeconds)))
        : 0.5;
      offset = lower + (upper - lower) * fraction;
    } else {
      offset *= Math.min(3, Math.max(1.2, targetExtraSeconds / Math.max(1, extraSeconds)));
    }
  }
  return { routes: scored, strategy, strategyIndex, nextOffsetKm: offset, closestTimeGap };
}

export function routesForExtraTime(plan: RoutePlan): PlannedRoute[] {
  const baseline = plan.routes[0];
  if (plan.extraMinutes === 0) return [baseline];
  const targetSeconds = baseline.durationSeconds + plan.extraMinutes * 60;
  const alternatives = plan.routes.slice(1)
    .filter((route) => isUsefulDiscoveryRoute(route, baseline, plan.extraMinutes))
    .sort((a, b) => discoveryBenefit(b) - discoveryBenefit(a) ||
      b.newGroundKm - a.newGroundKm ||
      Math.abs(a.durationSeconds - targetSeconds) - Math.abs(b.durationSeconds - targetSeconds));
  const longest = alternatives[0];
  if (!longest) return [baseline];
  const targetDistance = (baseline.distanceKm + longest.distanceKm) / 2;
  const middle = plan.routes.slice(1)
    .filter((route) => isMiddleRoute(route, baseline, longest))
    .sort((a, b) => Math.abs(a.distanceKm - targetDistance) - Math.abs(b.distanceKm - targetDistance) ||
      discoveryBenefit(b) - discoveryBenefit(a))[0];
  return middle ? [baseline, longest, middle] : [baseline, longest];
}
