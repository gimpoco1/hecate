import { describe, expect, it } from "vitest";
import { createCityRelief, createReliefFootprint, type ReliefBuilding, type ReliefFootprint } from "./cityRelief";
import { pointToDiscoveryCell } from "./geo";
import type { CityBoundary } from "./city";

const city: CityBoundary = {
  id: "test-city", name: "Test City", fetchedAt: 1,
  geometry: { type: "Polygon", coordinates: [
    [[0, 0], [.1, 0], [.1, .1], [0, .1], [0, 0]],
    [[.04, .04], [.06, .04], [.06, .06], [.04, .06], [.04, .04]],
  ] },
};
const cell = (lng: number, lat: number) => pointToDiscoveryCell({ lng, lat, recordedAt: 1 });
const gridPoint = (lng: number, lat: number, footprint: ReliefFootprint): [number, number] => [
  (lng + 180) / 360 * footprint.gridScale,
  (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * footprint.gridScale,
];

const courtyardBuilding = (footprint: ReliefFootprint): ReliefBuilding => ({
  height: 18, minHeight: 0, polygons: [[
    [[.0199, .0199], [.0201, .0199], [.0201, .0201], [.0199, .0201], [.0199, .0199]].map(([lng, lat]) => gridPoint(lng, lat, footprint)),
    [[.01996, .01996], [.02004, .01996], [.02004, .02004], [.01996, .02004], [.01996, .01996]].map(([lng, lat]) => gridPoint(lng, lat, footprint)),
  ]],
});

describe("city discovery relief", () => {
  it("includes only the selected city's discoveries and leaves inputs intact", () => {
    const cells = [cell(.02, .02), cell(.03, .02)];
    const original = structuredClone(cells);
    expect(createReliefFootprint([...cells, cell(1, 1), cell(.05, .05)], city)).toEqual(createReliefFootprint(cells, city));
    expect(cells).toEqual(original);
  });

  it("extrudes mapped heights, preserves courtyards and closes the underside without a rectangular platform", () => {
    const footprint = createReliefFootprint([cell(.02, .02), cell(.03, .02)], city);
    const relief = createCityRelief(footprint, [courtyardBuilding(footprint)]);
    const flat = createCityRelief(footprint, []);
    expect(relief.positions.slice(0, relief.groundVertexCount * 3)).toEqual(flat.positions);
    const heights = [...relief.positions].filter((_, index) => index % 3 === 1);
    expect(Math.max(...heights)).toBeCloseTo(18 * footprint.metresToModel, 6);
    expect(Math.min(...heights)).toBeLessThan(0);
    expect(Math.min(...relief.normals)).toBe(-1);
    expect(relief.normals.length).toBe(relief.positions.length);
    expect(relief.occlusion.length * 3).toBe(relief.positions.length);
    expect([...relief.positions].every(Number.isFinite)).toBe(true);
    for (let index = 0; index < relief.positions.length; index += 9) {
      if (relief.normals[index + 1] !== 1 || relief.positions[index + 1] <= 0) continue;
      const x = (relief.positions[index] + relief.positions[index + 3] + relief.positions[index + 6]) / 3 / footprint.scale + footprint.centerX;
      const y = (relief.positions[index + 2] + relief.positions[index + 5] + relief.positions[index + 8]) / 3 / footprint.scale + footprint.centerY;
      const lng = x * 360 - 180;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - y * 2))) * 180 / Math.PI;
      expect(lng > .01996 && lng < .02004 && lat > .01996 && lat < .02004).toBe(false);
    }
    // Separate discovered islands must not be joined by any face across undiscovered ground.
    const halfway = gridPoint(.025, .02, footprint)[0] / footprint.gridScale;
    const middleX = (halfway - footprint.centerX) * footprint.scale;
    for (let index = 0; index < relief.positions.length; index += 9) {
      const xs = [relief.positions[index], relief.positions[index + 3], relief.positions[index + 6]];
      expect(Math.min(...xs) < middleX && Math.max(...xs) > middleX).toBe(false);
    }
  });

  it("clips buildings at the discovery edge instead of revealing their undiscovered portions", () => {
    const footprint = createReliefFootprint([cell(.02, .02)], city);
    const building: ReliefBuilding = { height: 20, minHeight: 0, polygons: [[[[.01, .01], [.03, .01], [.03, .03], [.01, .03], [.01, .01]].map(([lng, lat]) => gridPoint(lng, lat, footprint))]] };
    const relief = createCityRelief(footprint, [building]);
    const xs = [...relief.positions].filter((_, index) => index % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(1.3, 5);
    expect(Math.min(...xs)).toBeCloseTo(-1.3, 5);
  });

  it("preserves reversed source elevations as a closed volume, matching MapLibre's visible extent", () => {
    const footprint = createReliefFootprint([cell(.02, .02)], city);
    const building = { ...courtyardBuilding(footprint), height: 4, minHeight: 7 };
    const relief = createCityRelief(footprint, [building]);
    const heights = [...relief.positions].filter((_, index) => index % 3 === 1);
    expect(Math.max(...heights)).toBeCloseTo(7 * footprint.metresToModel, 6);
    expect(heights.some(height => Math.abs(height - 4 * footprint.metresToModel) < 1e-6)).toBe(true);
    expect([...relief.positions].every(Number.isFinite)).toBe(true);
  });

  it("reports an empty city rather than rendering other cities", () => {
    expect(() => createReliefFootprint([cell(1, 1)], city)).toThrow("no discoveries");
  });
});
