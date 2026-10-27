import { describe, expect, it } from "vitest";
import { deviatingNavigationPlayback, simulationHeading, simulationPosition } from "./navigationSimulation";
import { advanceRouteProgress } from "./routeProgress";
import type { PlannedRoute } from "./explorationRouting";
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
  it("walks along the initial route then deviates far enough to trigger recalculation without reaching the destination", () => {
    const points = [{ lng: 2, lat: 41 }, { lng: 2.005, lat: 41 }, { lng: 2.005, lat: 41.005 }];
    const route: PlannedRoute = { id: "sample", points, maneuvers: [], distanceKm: 1,
      durationSeconds: 720, newGroundKm: 0, backtrackedKm: 0, unproductiveLoopKm: 0 };
    const before = structuredClone(route);
    const playback = deviatingNavigationPlayback(route);
    const geometry = prepareRouteGeometry(points);
    const path = prepareRouteGeometry(playback.points);
    const start = { distanceKm: 0, fraction: 0, position: points[0], acceptedPosition: points[0], distanceFromRouteM: 0 };
    const departure = simulationPosition(path, 0.05 / path.distanceKm);
    const onRoute = advanceRouteProgress(geometry, departure, start);
    expect(onRoute.distanceFromRouteM).toBeLessThan(1);
    expect(onRoute.distanceKm).toBeCloseTo(0.05, 4);
    const deviation = advanceRouteProgress(geometry, simulationPosition(path, 1), onRoute);
    expect(deviation.distanceFromRouteM).toBeGreaterThan(50);
    expect(deviation.fraction).toBeLessThan(1);
    expect(playback.durationSeconds).toBeGreaterThan(0);
    expect(route).toEqual(before);
  });
  it("reports the marker's actual heading before and after a simulated turn", () => {
    const geometry = prepareRouteGeometry([{ lng: 2, lat: 0 }, { lng: 2.001, lat: 0 }, { lng: 2.001, lat: -0.001 }]);
    expect(simulationHeading(geometry, 0)).toBeCloseTo(90);
    expect(simulationHeading(geometry, 0.25)).toBeCloseTo(90);
    expect(simulationHeading(geometry, 0.75)).toBeCloseTo(180);
    expect(simulationHeading(geometry, 1)).toBeCloseTo(180);
  });
  it("rejects empty and stationary routes explicitly", () => {
    expect(() => prepareRouteGeometry([])).toThrow(RangeError);
    expect(() => prepareRouteGeometry([{ lng: 2, lat: 41 }, { lng: 2, lat: 41 }])).toThrow(RangeError);
  });
});
