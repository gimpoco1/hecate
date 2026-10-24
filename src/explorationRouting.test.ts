import { describe, expect, it } from "vitest";
import { pointToDiscoveryCell } from "./geo";
import { calculateDirectRoute, calculateExplorationRoutes, findExplorationRoutes, estimateRouteDiscovery, parsePlannedRoutes, routesForExtraTime, DestinationTooCloseError, ExplorationRoutingError, type RoutePlan, type PlannedRoute } from "./explorationRouting";

const origin = { lat: 41.3874, lng: 2.1686 };
const destination = { lat: 41.4036, lng: 2.1744 };
const points = Array.from({ length: 31 }, (_, index) => ({ lat: origin.lat, lng: origin.lng + index * 0.0002 }));

function route(id: string, seconds: number, discoveredKm: number): PlannedRoute {
  return { id, points, distanceKm: 2, durationSeconds: seconds, newGroundKm: discoveredKm, backtrackedKm: 0, unproductiveLoopKm: 0 };
}

describe("exploration route planning", () => {
  it("estimates discovery against the actual footprint without modifying saved cells or crediting repeated paths twice", () => {
    const cells = points.map((point) => pointToDiscoveryCell({ ...point, recordedAt: 0 }));
    const before = structuredClone(cells);
    expect(estimateRouteDiscovery(points, [])).toBeGreaterThan(0.4);
    expect(estimateRouteDiscovery(points, cells)).toBe(0);
    const outward = estimateRouteDiscovery(points, []);
    expect(estimateRouteDiscovery([...points, ...[...points].reverse()], [])).toBeCloseTo(outward, 8);
    expect(cells).toEqual(before);
  });

  it("treats saved discovery cells as revealed footprints rather than individual pixels", () => {
    const center = { lat: 0, lng: 0 };
    const shortPath = [center, { lat: 0, lng: 0.00005 }];
    expect(estimateRouteDiscovery(shortPath, [pointToDiscoveryCell({ ...center, recordedAt: 0 })])).toBe(0);
  });

  it("targets the selected extra time rather than accepting any shorter detour", () => {
    const plan: RoutePlan = { extraMinutes: 20, mode: "pedestrian", origin, destination, routes: [
      route("direct", 600, 0.2), route("one-minute", 660, 0.6), route("too-long", 2_000, 1.5),
      route("closest", 1_790, 1), route("near-target", 1_820, 1.4), route("small-gain", 1_800, 0.25),
    ] };
    expect(routesForExtraTime(plan).map(({ id }) => id)).toEqual(["direct", "near-target"]);
    expect(routesForExtraTime({ ...plan, extraMinutes: 5 }).map(({ id }) => id)).toEqual(["direct"]);
    expect(plan.routes[1].id).toBe("one-minute");
  });

  it("keeps useful walking routes around ten minutes despite street-network timing gaps", () => {
    const plan: RoutePlan = { extraMinutes: 10, mode: "pedestrian", origin, destination, routes: [
      route("direct", 600, 0.2), route("nine-minutes", 1_139.8, 1), route("nearly-twelve", 1_315, 1.4),
      route("too-short", 660, 0.8),
    ] };
    expect(routesForExtraTime(plan).map(({ id }) => id)).toEqual(["direct", "nearly-twelve"]);
  });

  it("rejects extra out-and-back detours while allowing access already required by the direct route", () => {
    const direct = { ...route("direct", 600, 0.2), backtrackedKm: 0.1 };
    const spur = { ...route("spur", 1_800, 1.2), backtrackedKm: 0.25 };
    const loop = { ...route("loop", 1_790, 0.8), backtrackedKm: 0.1 };
    const plan: RoutePlan = { extraMinutes: 20, mode: "pedestrian", origin, destination, routes: [direct, spur, loop] };
    expect(routesForExtraTime(plan).map(({ id }) => id)).toEqual(["direct", "loop"]);
  });

  it("prefers avoiding explored streets over matching the target time exactly", () => {
    const plan: RoutePlan = { extraMinutes: 10, mode: "pedestrian", origin, destination, routes: [
      route("direct", 600, 0.2),
      { ...route("exact-but-familiar", 1_200, 0.8), distanceKm: 3 },
      { ...route("more-discovery", 1_260, 2.2), distanceKm: 3.2 },
      { ...route("unproductive-loop", 1_180, 2.5), unproductiveLoopKm: 0.5 },
    ] };
    expect(routesForExtraTime(plan).map(({ id }) => id)).toEqual(["direct", "more-discovery"]);
  });

  it("chooses a middle-distance second suggestion instead of a near-duplicate full detour", () => {
    const direct = { ...route("direct", 540, 2), distanceKm: 2.2 };
    const longest = { ...route("full", 840, 3.1), distanceKm: 3.5 };
    const duplicate = { ...route("duplicate", 830, 3), distanceKm: 3.6 };
    const middle = { ...route("middle", 690, 2.5), distanceKm: 2.85 };
    const plan: RoutePlan = { extraMinutes: 5, mode: "bicycle", origin, destination, routes: [direct, longest, duplicate, middle] };
    expect(routesForExtraTime(plan).map(({ id }) => id)).toEqual(["direct", "full", "middle"]);
    expect(routesForExtraTime({ ...plan, routes: [direct, longest, duplicate] }).map(({ id }) => id)).toEqual(["direct", "full"]);
  });

  it("rejects invalid provider geometry and returns structured routes", () => {
    expect(() => parsePlannedRoutes({ code: "Ok", routes: [] })).toThrow(ExplorationRoutingError);
    expect(() => parsePlannedRoutes({ code: "Ok", routes: [{ distance: 1, duration: 1, geometry: { type: "LineString", coordinates: [[2, 41], [NaN, 41]] } }] })).toThrow(ExplorationRoutingError);
    expect(parsePlannedRoutes({ code: "Ok", routes: [{ distance: 1_000, duration: 600, geometry: { type: "LineString", coordinates: [[2, 41], [2.01, 41]] } }] })[0].distanceKm).toBe(1);
  });

  it("rejects destinations too close before contacting the router", async () => {
    await expect(calculateExplorationRoutes(origin, origin, [], "pedestrian", 20, new AbortController().signal)).rejects.toBeInstanceOf(DestinationTooCloseError);
  });

  it("allows distant destinations to reach the router for either transport mode", async () => {
    const controller = new AbortController();
    controller.abort();
    for (const mode of ["pedestrian", "bicycle"] as const) {
      await expect(calculateDirectRoute(origin, { lat: 42, lng: 2 }, [], mode, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    }
  });

  it("keeps no-extra-time plans on the direct route", () => {
    const direct = route("direct", 600, 0.2);
    const plan: RoutePlan = { extraMinutes: 0, mode: "pedestrian", origin, destination, routes: [direct, route("detour", 900, 1)] };
    expect(routesForExtraTime(plan)).toEqual([direct]);
  });

  it("cancels the concurrent detour search before contacting the router", async () => {
    const controller = new AbortController();
    controller.abort();
    const direct: RoutePlan = { extraMinutes: 0, mode: "pedestrian", origin, destination, routes: [route("direct", 600, 0.2)] };
    await expect(findExplorationRoutes(direct, [], 10, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("routes walking and cycling destinations beyond the former app limits", async () => {
    const start = { lat: 41.399, lng: 2.1956 };
    const walking = await calculateDirectRoute(start, { lat: 41.496506, lng: 2.1534198 }, [], "pedestrian", AbortSignal.timeout(40_000));
    const cycling = await calculateDirectRoute(start, { lat: 41.6830176, lng: 2.2859632 }, [], "bicycle", AbortSignal.timeout(40_000));
    expect(walking.routes[0].distanceKm).toBeGreaterThan(10);
    expect(cycling.routes[0].distanceKm).toBeGreaterThan(30);
  }, 85_000);

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("finds a five-minute cycling detour near the Poblenou coast", async () => {
    const start = { lat: 41.399, lng: 2.1956 };
    const cells = [pointToDiscoveryCell({ ...start, recordedAt: 0 })];
    const plan = await calculateExplorationRoutes(start, { lat: 41.412, lng: 2.205 }, cells, "bicycle", 5, AbortSignal.timeout(60_000));
    console.info("Coastal cycling candidates", plan.routes.map((route) => ({ id: route.id, minutes: route.durationSeconds / 60, newGroundKm: route.newGroundKm, backtrackedKm: route.backtrackedKm, unproductiveLoopKm: route.unproductiveLoopKm })));
    const suggestions = routesForExtraTime(plan);
    expect(suggestions.length).toBeGreaterThan(1);
    for (const route of suggestions.slice(1, 2)) {
      expect(Math.abs(route.durationSeconds - plan.routes[0].durationSeconds - 300)).toBeLessThanOrEqual(60);
      expect(route.newGroundKm - plan.routes[0].newGroundKm).toBeGreaterThanOrEqual(0.1);
      expect(route.backtrackedKm - plan.routes[0].backtrackedKm).toBeLessThanOrEqual(0.025);
    }
  }, 65_000);

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("calculates direct walking and cycling estimates without discovery detours", async () => {
    const plans = await Promise.all((["pedestrian", "bicycle"] as const).map((mode) =>
      calculateDirectRoute(origin, destination, [], mode, AbortSignal.timeout(20_000)),
    ));
    for (const plan of plans) {
      expect(plan.extraMinutes).toBe(0);
      expect(plan.routes).toHaveLength(1);
      expect(plan.routes[0].durationSeconds).toBeGreaterThan(0);
      expect(plan.routes[0].id).toBe("direct");
    }
    expect(plans[1].routes[0].durationSeconds).toBeLessThan(plans[0].routes[0].durationSeconds);
  }, 25_000);

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("generates real walking detours near five and twenty extra minutes", async () => {
    const plans: RoutePlan[] = [];
    for (const extraMinutes of [5, 20]) {
      const plan = await calculateExplorationRoutes(origin, destination, [], "pedestrian", extraMinutes, new AbortController().signal);
      const suggestions = routesForExtraTime(plan);
      expect(suggestions.length).toBeGreaterThan(1);
      for (const alternative of suggestions.slice(1, 2)) {
        const extraSeconds = alternative.durationSeconds - plan.routes[0].durationSeconds;
        expect(Math.abs(extraSeconds - extraMinutes * 60)).toBeLessThanOrEqual(Math.min(120, extraMinutes * 12));
        expect(alternative.backtrackedKm - plan.routes[0].backtrackedKm).toBeLessThanOrEqual(0.025);
      }
      plans.push(plan);
      console.info("Targeted walking suggestions", { extraMinutes, extras: suggestions.slice(1).map((route) => (route.durationSeconds - plan.routes[0].durationSeconds) / 60) });
    }
    expect(routesForExtraTime(plans[1])[1].durationSeconds).toBeGreaterThan(routesForExtraTime(plans[0])[1].durationSeconds);
  }, 120_000);

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("generates real cycling detours near the selected extra time", async () => {
    const plan = await calculateExplorationRoutes(origin, destination, [], "bicycle", 10, new AbortController().signal);
    expect(plan.mode).toBe("bicycle");
    const suggestions = routesForExtraTime(plan);
    expect(suggestions.length).toBeGreaterThan(1);
    for (const route of suggestions.slice(1, 2)) {
      expect(Math.abs(route.durationSeconds - plan.routes[0].durationSeconds - 600)).toBeLessThanOrEqual(120);
      expect(route.backtrackedKm - plan.routes[0].backtrackedKm).toBeLessThanOrEqual(0.025);
    }
    console.info("Targeted cycling suggestions", suggestions.slice(1).map((route) => (route.durationSeconds - plan.routes[0].durationSeconds) / 60));
  }, 120_000);
  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("finds a ten-minute walking alternative near Sant Marti with existing discovery", async () => {
    const start = { lat: 41.399, lng: 2.1956 };
    const finish = { lat: 41.412, lng: 2.205 };
    const cells = Array.from({ length: 100 }, (_, index) => pointToDiscoveryCell({
      lat: start.lat + (finish.lat - start.lat) * index / 99,
      lng: start.lng + (finish.lng - start.lng) * index / 99,
      recordedAt: 0,
    }));
    const plan = await calculateExplorationRoutes(start, finish, cells, "pedestrian", 10, new AbortController().signal);
    const suggestions = routesForExtraTime(plan);
    expect(suggestions.length).toBeGreaterThan(1);
    for (const route of suggestions.slice(1, 2)) {
      expect(Math.abs(route.durationSeconds - plan.routes[0].durationSeconds - 600)).toBeLessThanOrEqual(120);
      expect(route.newGroundKm - plan.routes[0].newGroundKm).toBeGreaterThanOrEqual(0.1);
      expect(route.backtrackedKm - plan.routes[0].backtrackedKm).toBeLessThanOrEqual(0.025);
    }
    console.info("Sant Marti discovery alternatives", suggestions.slice(1).map((route) => ({
      extraMinutes: (route.durationSeconds - plan.routes[0].durationSeconds) / 60,
      extraNewGroundKm: route.newGroundKm - plan.routes[0].newGroundKm,
    })));
  }, 120_000);

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("steers discovery routes away from a large explored area", async () => {
    const start = { lat: 41.399, lng: 2.1956 };
    const finish = { lat: 41.412, lng: 2.205 };
    const cells = Array.from({ length: 74 }, (_, row) => Array.from({ length: 57 }, (_, column) =>
      pointToDiscoveryCell({ lat: 41.395 + row * 0.0003, lng: 2.1956 + column * 0.0004, recordedAt: 0 }),
    )).flat();
    const plan = await calculateExplorationRoutes(start, finish, cells, "pedestrian", 10, new AbortController().signal);
    const suggestions = routesForExtraTime(plan);
    console.info("Discovery-first route comparison", plan.routes.map((route) => ({
      id: route.id, newGroundKm: route.newGroundKm, knownKm: route.distanceKm - route.newGroundKm,
      extraMinutes: (route.durationSeconds - plan.routes[0].durationSeconds) / 60,
      unproductiveLoopKm: route.unproductiveLoopKm,
    })));
    expect(suggestions.length).toBeGreaterThan(1);
    expect(suggestions[1].newGroundKm - plan.routes[0].newGroundKm).toBeGreaterThan(0.5);
    expect(suggestions[1].unproductiveLoopKm).toBeLessThanOrEqual(plan.routes[0].unproductiveLoopKm + 0.025);
  }, 180_000);

});
