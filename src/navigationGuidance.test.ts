import { prepareRouteGeometry } from "./routeGeometry";
import { describe, expect, it } from "vitest";
import { hasReachedRouteDestination, navigationCue, routeContinuesStraight } from "./navigationGuidance";
import type { PlannedRoute } from "./explorationRouting";
import { distanceKm } from "./geo";

describe("turn guidance", () => {
  it("treats a cycle-lane connector as continuing ahead", () => {
    const points = [
      [0.000000000, 0.000000000],
      [0.000621825, 0.000565000],
      [0.000654079, 0.000550000],
      [0.000687083, 0.000544000],
      [0.000717837, 0.000542000],
      [0.000744840, 0.000548000],
      [0.000751591, 0.000552000],
      [0.000786095, 0.000577000],
      [0.000822850, 0.000610000],
      [0.000861104, 0.000651000],
      [0.000867855, 0.000670000],
      [0.000871606, 0.000689000],
      [0.000870856, 0.000721000],
      [0.000866355, 0.000763000],
      [0.000859604, 0.000788000],
      [0.000905360, 0.000823000],
      [0.001029125, 0.000932000],
      [0.001238400, 0.001131000],
    ].map(([lng, lat]) => ({ lng, lat }));
    const lengths = points.slice(1).map((point, index) => distanceKm({ ...points[index], recordedAt: 0 }, { ...point, recordedAt: 0 }));
    expect(routeContinuesStraight(prepareRouteGeometry(points), lengths[0] / lengths.reduce((sum, length) => sum + length, 0))).toBe(true);
  });
  it("looks beyond a small junction connector while preserving a real street turn", () => {
    const junction = [{ lng: 2, lat: 0 }, { lng: 2, lat: 0.00078 }, { lng: 1.99997, lat: 0.0008 }, { lng: 2, lat: 0.00082 }, { lng: 2, lat: 0.0016 }];
    expect(routeContinuesStraight(prepareRouteGeometry(junction), 0.5)).toBe(true);
    expect(routeContinuesStraight(prepareRouteGeometry([{ lng: 2, lat: 0 }, { lng: 2.001, lat: 0 }, { lng: 2.001, lat: 0.001 }]), 0.5)).toBe(false);
  });
  const route: PlannedRoute = { id: "route", points: [{ lng: 2, lat: 41 }, { lng: 2.001, lat: 41 }], distanceKm: 1,
    durationSeconds: 600, newGroundKm: 1, backtrackedKm: 0, unproductiveLoopKm: 0,
    maneuvers: [{ instruction: "Head east.", symbol: "straight", fraction: 0, roadName: "Main Street" },
      { instruction: "Turn left onto High Street.", symbol: "left", fraction: 0.4, roadName: "High Street" },
      { instruction: "Arrive at your destination.", symbol: "arrive", fraction: 1, roadName: "High Street" }] };
  const progress = { distanceKm: 0.3, fraction: 0.3, position: route.points[0], acceptedPosition: route.points[0], distanceFromRouteM: 0 };
  it("shows distance along the route to the next turn and advances after it", () => {
    expect(navigationCue(route, { ...progress, fraction: 0.38 })).toEqual({ instruction: "Turn left onto High Street.", symbol: "left", distanceMeters: 20 });
    expect(navigationCue(route, { ...progress, fraction: 0.41 })?.symbol).toBe("arrive");
    expect(navigationCue(route, { ...progress, fraction: 1, position: route.points.at(-1)! })?.distanceMeters).toBe(0);
  });
  it("shows the upcoming maneuver immediately and counts down throughout the approach", () => {
    expect(navigationCue(route, progress)).toEqual({ instruction: "Turn left onto High Street.", symbol: "left", distanceMeters: 100 });
    expect(navigationCue(route, { ...progress, fraction: 0.8 })).toEqual({ instruction: "Arrive at your destination.", symbol: "arrive", distanceMeters: 200 });
    expect(navigationCue(route, { ...progress, fraction: 0.99 })?.symbol).toBe("arrive");
  });
  it("skips straight continuation cues when a real turn is farther ahead", () => {
    const withContinuation: PlannedRoute = { ...route, maneuvers: [route.maneuvers[0], { instruction: "Stay on Main Street.", symbol: "straight", fraction: 0.2, roadName: "Main Street" }, ...route.maneuvers.slice(1)] };
    expect(navigationCue(withContinuation, { ...progress, fraction: 0 })).toEqual({ instruction: "Turn left onto High Street.", symbol: "left", distanceMeters: 400 });
  });
  it("recognizes arrival by another route without depending on completed route progress", () => {
    const endpoint = route.points[route.points.length - 1];
    expect(hasReachedRouteDestination(route, endpoint)).toBe(true);
    expect(hasReachedRouteDestination(route, { ...endpoint, lat: endpoint.lat + 0.00005 })).toBe(true);
    expect(hasReachedRouteDestination(route, { ...endpoint, lat: endpoint.lat + 0.0002 })).toBe(false);
  });
  it("hides turn instructions when the user leaves the route", () => {
    expect(navigationCue(route, { ...progress, distanceFromRouteM: 80 })).toBeNull();
  });
  it("requires physical endpoint proximity before declaring arrival", () => {
    const endpoint = route.points[route.points.length - 1];
    const beside = { ...progress, fraction: 1, position: { lng: endpoint.lng, lat: endpoint.lat + 0.00035 }, distanceFromRouteM: 39 };
    expect(navigationCue(route, beside)?.distanceMeters).toBeGreaterThan(10);
    expect(navigationCue(route, { ...beside, position: { lng: endpoint.lng, lat: endpoint.lat + 0.0001 } })?.distanceMeters).toBeGreaterThan(10);
    expect(navigationCue(route, { ...beside, position: endpoint })?.distanceMeters).toBe(0);
  });
});
