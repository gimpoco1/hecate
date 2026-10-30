import { describe, expect, it } from "vitest";
import { intersectReliefPolygons, smoothReliefPolygons, type MultiPolygon } from "./reliefPolygons";

const area = (polygons: MultiPolygon): number => polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring, index) => {
  const signed = ring.slice(0, -1).reduce((value, point, i) => value + point[0] * ring[i + 1][1] - ring[i + 1][0] * point[1], 0);
  return sum + Math.abs(signed) / 2 * (index === 0 ? 1 : -1);
}, 0), 0);

describe("rounded discovery outlines", () => {
  it("softens grid corners while retaining holes, small islands and the input geometry", () => {
    const polygons: MultiPolygon = [[
      [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]],
      [[3, 3], [3, 5], [5, 5], [5, 3], [3, 3]],
    ], [[[12, 0], [13, 0], [13, 1], [12, 1], [12, 0]]]];
    const original = structuredClone(polygons);
    const rounded = smoothReliefPolygons(polygons);
    expect(polygons).toEqual(original);
    expect(rounded).toHaveLength(2);
    expect(rounded.some(polygon => polygon.length === 2)).toBe(true);
    expect(area(rounded)).toBeGreaterThan(area(polygons) * .95);
    expect(area(rounded)).toBeLessThan(area(polygons) * 1.05);
    // The square's extreme corner is cut back into a curve, not merely subdivided.
    const corner: MultiPolygon = [[[[0, 0], [.1, 0], [.1, .1], [0, .1], [0, 0]]]];
    expect(intersectReliefPolygons(rounded, corner)).toEqual([]);
    for (const ring of rounded.flat()) {
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(ring.flat().every(Number.isFinite)).toBe(true);
    }
  });
});
