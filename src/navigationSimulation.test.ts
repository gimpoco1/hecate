import { describe, expect, it } from "vitest";
import { simulationPosition } from "./navigationSimulation";
import { prepareRouteGeometry } from "./routeGeometry";

describe("navigation simulation", () => {
  it("follows route geometry through turns by distance and stops at the destination", () => {
    const points = [{ lng: 2, lat: 0 }, { lng: 2, lat: 0 }, { lng: 2.001, lat: 0 }, { lng: 2.001, lat: 0.001 }];
    const before = structuredClone(points);
    const segments = prepareRouteGeometry(points);
    expect(simulationPosition(segments, 0)).toEqual(points[0]);
    expect(simulationPosition(segments, 0.25).lng).toBeCloseTo(2.0005, 7);
    expect(simulationPosition(segments, 0.25).lat).toBeCloseTo(0, 7);
    expect(simulationPosition(segments, 0.75).lng).toBeCloseTo(2.001, 7);
    expect(simulationPosition(segments, 0.75).lat).toBeCloseTo(0.0005, 7);
    expect(simulationPosition(segments, 2)).toEqual(points[3]);
    expect(points).toEqual(before);
  });
  it("rejects empty and stationary routes explicitly", () => {
    expect(() => prepareRouteGeometry([])).toThrow(RangeError);
    expect(() => prepareRouteGeometry([{ lng: 2, lat: 41 }, { lng: 2, lat: 41 }])).toThrow(RangeError);
  });
});
