import { describe, expect, it } from "vitest";
import { backtrackedDistanceKm, closedRouteLoops } from "./routeQuality";

function point(x: number, y: number): { lng: number; lat: number } {
  return { lng: x / 111_320, lat: y / 111_320 };
}

describe("route backtracking quality", () => {
  it("detects an out-and-back spur despite different vertices on the return leg", () => {
    const route = [point(0, 0), point(200, 0), point(200, 100), point(200, 160), point(200, 65), point(200, 0), point(400, 0)];
    expect(backtrackedDistanceKm(route)).toBeCloseTo(0.16, 6);
  });

  it("detects partially overlapping return segments and tolerates coordinate rounding", () => {
    expect(backtrackedDistanceKm([point(0, 0), point(200, 0), point(300, 0), point(100, 0.2)]))
      .toBeCloseTo(0.2, 3);
  });

  it("does not penalize proper loops, nearby parallel streets, crossings, or stationary vertices", () => {
    expect(backtrackedDistanceKm([point(0, 0), point(200, 0), point(200, 100), point(0, 100), point(0, 0)]))
      .toBe(0);
    expect(backtrackedDistanceKm([point(0, 0), point(200, 0), point(200, 4), point(0, 4)]))
      .toBe(0);
    expect(backtrackedDistanceKm([point(0, 0), point(100, 100), point(0, 100), point(100, 0)]))
      .toBe(0);
    expect(backtrackedDistanceKm([point(0, 0), point(0, 0), point(100, 0)]))
      .toBe(0);
  });
  it("finds inserted closed loops separately from out-and-back segments", () => {
    const points = [point(0, 0), point(200, 0), point(200, 200), point(400, 200), point(400, 0), point(200, 0), point(600, 0)];
    expect(closedRouteLoops(points)).toEqual([{ startIndex: 1, endIndex: 5, distanceKm: expect.closeTo(0.8, 5) }]);
    expect(closedRouteLoops([point(0, 0), point(100, 0), point(200, 0)])).toEqual([]);
  });

});
