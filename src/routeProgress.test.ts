import { prepareRouteGeometry } from "./routeGeometry";
import { describe, expect, it } from "vitest";
import { advanceRouteProgress, type RouteProgress } from "./routeProgress";

describe("active route progress", () => {
  const points = [{ lng: 2, lat: 0 }, { lng: 2.001, lat: 0 }, { lng: 2.001, lat: 0.001 }];
  const start: RouteProgress = { distanceKm: 0, fraction: 0, position: points[0], acceptedPosition: points[0], distanceFromRouteM: 0 };
  it("splits progress within segments and advances through a turn to the destination", () => {
    const halfway = advanceRouteProgress(prepareRouteGeometry(points), { lng: 2.0005, lat: 0 }, start);
    expect(halfway.fraction).toBeCloseTo(0.25, 5);
    const turned = advanceRouteProgress(prepareRouteGeometry(points), { lng: 2.001, lat: 0.0005 }, halfway);
    expect(turned.fraction).toBeCloseTo(0.75, 5);
    expect(advanceRouteProgress(prepareRouteGeometry(points), points[2], turned).fraction).toBe(1);
  });
  it("keeps completed ground pale when GPS moves backwards and does not credit off-route positions", () => {
    const progress = advanceRouteProgress(prepareRouteGeometry(points), { lng: 2.0005, lat: 0 }, start);
    expect(advanceRouteProgress(prepareRouteGeometry(points), { lng: 2.0004, lat: 0 }, progress).fraction).toBe(progress.fraction);
    expect(advanceRouteProgress(prepareRouteGeometry(points), { lng: 2.002, lat: 0.0005 }, progress).fraction).toBe(progress.fraction);
  });
  it("does not mark an entire loop completed when a later segment is closer to the start", () => {
    const loop = [...points, { lng: 2.00001, lat: 0.00001 }, { lng: 2, lat: -0.001 }];
    const progress = advanceRouteProgress(prepareRouteGeometry(loop), loop[3], start);
    expect(progress.distanceKm).toBeLessThan(0.005);
  });
  it("reacquires progress after an off-route fix and rejoining farther ahead", () => {
    const route = [{ lng: 2, lat: 0 }, { lng: 2.02, lat: 0 }];
    const offRoute = advanceRouteProgress(prepareRouteGeometry(route), { lng: 2.01, lat: 0.001 }, start);
    expect(offRoute.distanceKm).toBe(0);
    expect(offRoute.position).toEqual({ lng: 2.01, lat: 0.001 });
    const rejoined = advanceRouteProgress(prepareRouteGeometry(route), { lng: 2.01, lat: 0 }, offRoute);
    expect(rejoined.fraction).toBeCloseTo(0.5, 5);
    expect(advanceRouteProgress(prepareRouteGeometry(route), { lng: 2.0101, lat: 0 }, rejoined).fraction).toBeGreaterThan(rejoined.fraction);
  });
});
