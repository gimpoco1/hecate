import { describe, expect, it } from "vitest";
import { prepareRouteGeometry, routePositionAtDistance } from "./routeGeometry";

describe("prepared route geometry", () => {
  it("locates points across a long route and preserves exact endpoints and segment boundaries", () => {
    const points = Array.from({ length: 1001 }, (_, index) => ({ lng: index * 0.001, lat: 0 }));
    const before = structuredClone(points);
    const geometry = prepareRouteGeometry(points);
    expect(routePositionAtDistance(geometry, geometry.distanceKm / 4).lng).toBeCloseTo(0.25, 8);
    expect(routePositionAtDistance(geometry, geometry.segments[500].endKm)).toEqual(points[501]);
    expect(routePositionAtDistance(geometry, -1)).toEqual(points[0]);
    expect(routePositionAtDistance(geometry, geometry.distanceKm + 1)).toEqual(points[1000]);
    expect(points).toEqual(before);
  });
});
