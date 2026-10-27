import { describe, expect, it, vi } from "vitest";
import { pointToDiscoveryCell } from "./geo";
import { calculateNavigationRoute, calculateDirectRoute, calculateExplorationRoutes, findExplorationRoutes, estimateRouteDiscovery, parsePlannedRoutes, routesForExtraTime, DestinationTooCloseError, ExplorationRoutingError, type RoutePlan, type PlannedRoute } from "./explorationRouting";

const origin = { lat: 41.3874, lng: 2.1686 };
const destination = { lat: 41.4036, lng: 2.1744 };
const points = Array.from({ length: 31 }, (_, index) => ({ lat: origin.lat, lng: origin.lng + index * 0.0002 }));

function route(id: string, seconds: number, discoveredKm: number): PlannedRoute {
  return { id, points, maneuvers: [], distanceKm: 2, durationSeconds: seconds, newGroundKm: discoveredKm, backtrackedKm: 0, unproductiveLoopKm: 0 };
}

describe("exploration route planning", () => {
  it("normalizes keep-right wording while preserving the actual fork direction", () => {
    const parsed = parsePlannedRoutes({ code: "Ok", routes: [{ distance: 200, duration: 100,
      geometry: { type: "LineString", coordinates: [[2, 0], [2.001, 0], [2.002, 0]] }, legs: [{ steps: [
        { name: "Oak Street", distance: 100, maneuver: { instruction: "Head east.", type: "depart" } },
        { name: "Oak Street", distance: 100, maneuver: { instruction: "Keep right to stay on Oak Street.", type: "fork", modifier: "slight right" } },
        { name: "Oak Street", distance: 0, maneuver: { instruction: "You have arrived.", type: "arrive" } },
      ] }] }] });
    expect(parsed[0].maneuvers[1]).toMatchObject({ instruction: "Stay on Oak Street.", symbol: "slight-right", roadName: "Oak Street" });
  });
  it.each([
    { name: "straight continuation", coordinates: [[2, 0], [2.001, 0], [2.002, 0]], road: "Main Street", type: "continue", modifier: "left", expected: ["straight", "straight", "arrive"] },
    { name: "real same-street turn", coordinates: [[2, 0], [2.001, 0], [2.001, 0.001]], road: "Main Street", type: "turn", modifier: "left", expected: ["straight", "left", "arrive"] },
    { name: "street-name change without local bearing evidence", coordinates: [[2, 0], [2.001, 0], [2.002, 0]], road: "Other Street", type: "turn", modifier: "right", expected: ["straight", "right", "arrive"] },
    { name: "real turn onto another street", coordinates: [[2, 0], [2.001, 0], [2.001, -0.001]], road: "Cross Street", type: "turn", modifier: "right", expected: ["straight", "right", "arrive"] },
    { name: "fork requiring a choice", coordinates: [[2, 0], [2.001, 0], [2.002, 0]], road: "Main Street", type: "fork", modifier: "slight left", expected: ["straight", "slight-left", "arrive"] },
  ])("handles $name using the route geometry", ({ coordinates, road, type, modifier, expected }) => {
    const parsed = parsePlannedRoutes({ code: "Ok", routes: [{ distance: 200, duration: 100,
      geometry: { type: "LineString", coordinates }, legs: [{ steps: [
        { name: "Main Street", distance: 100, maneuver: { instruction: "Head east.", type: "depart" } },
        { name: road, distance: 100, maneuver: { instruction: "Turn left to stay on Main Street.", type, modifier } },
        { name: road, distance: 0, maneuver: { instruction: "You have arrived.", type: "arrive" } },
      ] }] }] });
    expect(parsed[0].maneuvers.map(({ symbol }) => symbol)).toEqual(expected);
  });
  it("preserves both real turns through a short named connector between parallel streets", () => {
    const parsed = parsePlannedRoutes({ code: "Ok", routes: [{ distance: 233, duration: 200,
      geometry: { type: "LineString", coordinates: [[0, 0], [0.001, 0], [0.001, 0.00009], [0.002, 0.00009]] }, legs: [{ steps: [
        { name: "A", distance: 111, maneuver: { instruction: "Head east on A.", type: "depart", bearing_before: 0, bearing_after: 90 } },
        { name: "Link Street", distance: 10, maneuver: { instruction: "Turn left onto Link Street.", type: "turn", modifier: "left", bearing_before: 90, bearing_after: 0 } },
        { name: "B", distance: 112, maneuver: { instruction: "Turn right onto B.", type: "turn", modifier: "right", bearing_before: 0, bearing_after: 90 } },
        { name: "B", distance: 0, maneuver: { instruction: "You have arrived.", type: "arrive", bearing_before: 90, bearing_after: 0 } },
      ] }] }] });
    expect(parsed[0].maneuvers.map(({ symbol }) => symbol)).toEqual(["straight", "left", "right", "arrive"]);
  });
  it.each([
    { status: 400, code: "DistanceExceeded", attempts: 1, errorName: "RouteDistanceExceededError" },
    { status: 403, code: "Forbidden", attempts: 1, errorName: "RouteRequestError" },
    { status: 503, code: "Unavailable", attempts: 2, errorName: "RouteRequestError" },
  ])("makes $attempts request(s) for HTTP $status $code", async ({ status, code, attempts, errorName }) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code }), {
      status, headers: { "content-type": "application/json" },
    }));
    try {
      await expect(calculateDirectRoute(origin, destination, [], "bicycle", new AbortController().signal)).rejects.toMatchObject({ name: errorName, status });
      expect(fetch).toHaveBeenCalledTimes(attempts);
    } finally {
      fetch.mockRestore();
    }
  });
  it("recalculates a cycling journey within 100 m while preserving the new origin and destination", async () => {
    const start = { lng: 2, lat: 0 };
    const finish = { lng: 2.0006, lat: 0 };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "Ok", routes: [{
      distance: 67, duration: 20, geometry: { type: "LineString", coordinates: [[start.lng, start.lat], [finish.lng, finish.lat]] },
      legs: [{ steps: [
        { distance: 67, maneuver: { instruction: "Head east.", type: "depart" } },
        { distance: 0, maneuver: { instruction: "You have arrived.", type: "arrive" } },
      ] }],
    }] })));
    try {
      await expect(calculateDirectRoute(start, finish, [], "bicycle", new AbortController().signal)).rejects.toBeInstanceOf(DestinationTooCloseError);
      const plan = await calculateNavigationRoute(start, finish, [], "bicycle", new AbortController().signal);
      expect(plan.routes[0].points).toEqual([start, finish]);
      expect(plan.routes[0].maneuvers.at(-1)?.symbol).toBe("arrive");
      const request = new URL(String(fetch.mock.calls[0][0]));
      expect(JSON.parse(request.searchParams.get("json")!)).toMatchObject({ costing: "bicycle", locations: [
        { lat: start.lat, lon: start.lng }, { lat: finish.lat, lon: finish.lng },
      ] });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      fetch.mockRestore();
    }
  });
  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("finds a twenty-minute cycling detour to a nearby destination", async () => {
    const start = { lat: 41.399, lng: 2.1956 };
    const finish = { lat: 41.4012, lng: 2.1974 };
    const cells = [pointToDiscoveryCell({ ...start, recordedAt: 0 })];
    const plan = await calculateExplorationRoutes(start, finish, cells, "bicycle", 20, new AbortController().signal);
    const suggestions = routesForExtraTime(plan);
    console.info("Nearby cycling detours", plan.routes.map(({ durationSeconds, distanceKm, backtrackedKm, unproductiveLoopKm, newGroundKm }) => ({ durationSeconds, distanceKm, backtrackedKm, unproductiveLoopKm, newGroundKm })));
    expect(suggestions.length).toBeGreaterThan(1);
    expect(Math.abs(suggestions[1].durationSeconds - plan.routes[0].durationSeconds - 1200)).toBeLessThanOrEqual(120);
    expect(suggestions[1].newGroundKm).toBeGreaterThan(plan.routes[0].newGroundKm + 0.1);
    expect(suggestions[1].backtrackedKm).toBeLessThanOrEqual(plan.routes[0].backtrackedKm + 0.025);
  }, 120_000);
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
    const parsed = parsePlannedRoutes({ code: "Ok", routes: [{ distance: 1_000, duration: 600, geometry: { type: "LineString", coordinates: [[2, 41], [2.005, 41], [2.005, 41.0037735]] }, legs: [{ steps: [
      { distance: 500, maneuver: { instruction: "Head east.", type: "depart" } },
      { distance: 500, maneuver: { instruction: "Turn left.", type: "turn", modifier: "left" } },
      { distance: 0, maneuver: { instruction: "You have arrived.", type: "arrive" } },
    ] }] }] })[0];
    expect(parsed.distanceKm).toBe(1);
    expect(parsed.maneuvers).toEqual([
      { instruction: "Head east.", symbol: "straight", fraction: 0, roadName: "" },
      { instruction: "Turn left.", symbol: "left", fraction: 0.5, roadName: "" },
      { instruction: "You have arrived.", symbol: "arrive", fraction: 1, roadName: "" },
    ]);
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
    await expect(findExplorationRoutes(direct, [], 10, controller.signal, () => {})).rejects.toMatchObject({ name: "AbortError" });
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
    const controller = new AbortController();
    const direct = await calculateDirectRoute(origin, destination, [], "bicycle", controller.signal);
    const started = performance.now();
    const published: RoutePlan[] = [];
    let firstResultMs = 0;
    const plan = await findExplorationRoutes(direct, [], 10, controller.signal, (available) => {
      if (published.length === 0) firstResultMs = performance.now() - started;
      expect(routesForExtraTime(available).length).toBeGreaterThan(1);
      published.push(available);
    });
    expect(published.length).toBeGreaterThan(0);
    console.info("Progressive route timing", { firstResultMs, completeMs: performance.now() - started });
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
