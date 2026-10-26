import { describe, expect, it } from "vitest";
import { navigationCameraStep, routeCameraBearing } from "./routeCamera";

describe("planned journey camera", () => {
  it("moves and turns gradually along the shortest rotation arc", () => {
    const target = { lng: 2.001, lat: 41.001 };
    let frame = { lng: 2, lat: 41, bearing: 359 };
    const first = navigationCameraStep(frame, target, frame.bearing, 1, 16);
    expect(first.lng).toBeGreaterThan(frame.lng);
    expect(first.lng).toBeLessThan(target.lng);
    expect(first.bearing).toBeGreaterThan(359);
    expect(first.bearing).toBeLessThan(360);
    for (let index = 0; index < 240; index += 1) frame = navigationCameraStep(frame, target, frame.bearing, 1, 16);
    expect(frame.lng).toBeCloseTo(target.lng, 6);
    expect(frame.bearing).toBeCloseTo(361, 2);
  });
  it("smooths navigation consistently at different frame rates", () => {
    const target = { lng: 2.001, lat: 41.001 };
    const run = (elapsed: number, frames: number): ReturnType<typeof navigationCameraStep> => {
      let frame = { lng: 2, lat: 41, bearing: 0 };
      for (let index = 0; index < frames; index += 1) frame = navigationCameraStep(frame, target, frame.bearing, 90, elapsed);
      return frame;
    };
    expect(run(10, 100).bearing).toBeCloseTo(run(20, 50).bearing, 8);
    expect(run(10, 100).lng).toBeCloseTo(run(20, 50).lng, 8);
  });
  it("ignores duplicate route points", () => {
    const origin = { lng: 2, lat: 41 };
    const route = [origin, origin, { lng: 2, lat: 41.001 }];
    expect(routeCameraBearing(route, origin)).toBeCloseTo(0, 0);
  });

  it("uses the nearby section of the selected route", () => {
    const route = [{ lng: 2, lat: 41 }, { lng: 2, lat: 41.001 }, { lng: 2.001, lat: 41.001 }];
    expect(routeCameraBearing(route, route[1])).toBeCloseTo(90, 0);
  });
  it("faces the street beneath the user instead of the next street at the nearest vertex", () => {
    const route = [{ lng: 2, lat: 41 }, { lng: 2.002, lat: 41 }, { lng: 2.002, lat: 41.002 }];
    expect(routeCameraBearing(route, { lng: 2.0018, lat: 41 })).toBeCloseTo(90, 0);
  });

  it("faces the next street after a short access connector", () => {
    const route = [{ lng: 2, lat: 41 }, { lng: 2, lat: 41.0001 }, { lng: 2.001, lat: 41.0001 }];
    expect(routeCameraBearing(route, route[0])).toBeCloseTo(90, 0);
  });

  it("keeps a street made of short collinear vertices pointed ahead", () => {
    const route = Array.from({ length: 12 }, (_, index) => ({ lng: 2 + index * 0.00002, lat: 41 }));
    expect(routeCameraBearing(route, route[0])).toBeCloseTo(90, 0);
  });

  it("aligns to the long forward segment rather than a slightly angled access stub", () => {
    const route = [{ lng: 2, lat: 41 }, { lng: 2, lat: 41.00002 }, { lng: 2.0004828, lat: 41.00102 }];
    expect(routeCameraBearing(route, route[0])).toBeCloseTo(20, 0);
  });

});
