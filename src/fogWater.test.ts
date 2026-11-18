import { describe, expect, it } from "vitest";
import { MercatorCoordinate } from "maplibre-gl";
import type { Polygon } from "geojson";
import { fogWaterMeshes, FOG_WATER_ZOOM, type FogWaterMesh } from "./fogWater";

function covers(meshes: FogWaterMesh[], lng: number, lat: number): boolean {
  const point = MercatorCoordinate.fromLngLat({ lng, lat });
  return meshes.some((mesh) => {
    const px = (point.x * 2 ** FOG_WATER_ZOOM - mesh.x) * 8192;
    const py = (point.y * 2 ** FOG_WATER_ZOOM - mesh.y) * 8192;
    for (let index = 0; index < mesh.vertices.length; index += 6) {
      const [ax, ay, bx, by, cx, cy] = mesh.vertices.slice(index, index + 6);
      const first = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const second = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const third = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      if ((first >= 0 && second >= 0 && third >= 0) || (first <= 0 && second <= 0 && third <= 0)) return true;
    }
    return false;
  });
}

describe("fog water exclusion", () => {
  it("clears water while preserving fog on islands and the surrounding land", () => {
    const lake: Polygon = { type: "Polygon", coordinates: [
      [[2, 41], [2.1, 41], [2.1, 41.1], [2, 41.1], [2, 41]],
      [[2.04, 41.04], [2.06, 41.04], [2.06, 41.06], [2.04, 41.06], [2.04, 41.04]],
    ] };
    const meshes = fogWaterMeshes([lake]);
    expect(covers(meshes, 2.02, 41.02)).toBe(true);
    expect(covers(meshes, 2.05, 41.05)).toBe(false);
    expect(covers(meshes, 2.12, 41.05)).toBe(false);
  });

  it("handles separate water polygons in one vector feature", () => {
    const meshes = fogWaterMeshes([{ type: "MultiPolygon", coordinates: [
      [[[2, 41], [2.01, 41], [2.01, 41.01], [2, 41.01], [2, 41]]],
      [[[2.1, 41], [2.11, 41], [2.11, 41.01], [2.1, 41.01], [2.1, 41]]],
    ] }]);
    expect(covers(meshes, 2.005, 41.005)).toBe(true);
    expect(covers(meshes, 2.105, 41.005)).toBe(true);
    expect(covers(meshes, 2.05, 41.005)).toBe(false);
  });
});
