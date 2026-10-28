import { describe, expect, it } from "vitest";
import { MercatorCoordinate } from "maplibre-gl";
import { DISCOVERY_RADIUS_M } from "./geo";
import {
  appendedFogRouteCoordinates,
  fogRevealCoordinates,
  fogTileCoordinates,
} from "./fogLayer";

describe("fogTileCoordinates", () => {
  it.each([
    [2.17, 41.38],
    [-122.42, 37.77],
    [179.999, 0],
  ])("preserves subpixel GPU precision at %s, %s", (lng, lat) => {
    const coordinate = MercatorCoordinate.fromLngLat({ lng, lat });
    const tile: [number, number] = [
      Math.floor(coordinate.x * 4096),
      Math.floor(coordinate.y * 4096),
    ];
    const gpuCoordinate = new Float32Array(
      fogTileCoordinates([coordinate.x, coordinate.y], tile),
    );
    const restored = [
      (tile[0] + gpuCoordinate[0] / 8192) / 4096,
      (tile[1] + gpuCoordinate[1] / 8192) / 4096,
    ];
    const worldPixelsAtMaxZoom = 512 * 2 ** 19;
    expect(Math.abs(restored[0] - coordinate.x) * worldPixelsAtMaxZoom).toBeLessThan(0.01);
    expect(Math.abs(restored[1] - coordinate.y) * worldPixelsAtMaxZoom).toBeLessThan(0.01);
  });
});

describe("fogRevealCoordinates", () => {
  it("fills route gaps without duplicating discovery cells", () => {
    const start = { lng: 2.17, lat: 41.38, recordedAt: 1 };
    const end = { lng: 2.171, lat: 41.38, recordedAt: 2 };
    const coordinates = fogRevealCoordinates({
      routeSegments: [[start, end]],
      cellCenters: [[start.lng, start.lat]],
    });

    expect(coordinates[0]).toEqual([start.lng, start.lat]);
    expect(coordinates.at(-1)).toEqual([end.lng, end.lat]);
    expect(coordinates.length).toBeGreaterThan(2);
    expect(coordinates.length).toBeLessThanOrEqual(
      Math.ceil(100 / DISCOVERY_RADIUS_M) + 1,
    );
  });

  it("interpolates across the antimeridian using the short path", () => {
    const coordinates = fogRevealCoordinates({
      routeSegments: [[
        { lng: 179.9998, lat: 0, recordedAt: 1 },
        { lng: -179.9998, lat: 0, recordedAt: 2 },
      ]],
      cellCenters: [],
    });

    expect(coordinates.some(([lng]) => Math.abs(lng) < 90)).toBe(false);
  });
});

describe("appendedFogRouteCoordinates", () => {
  it("returns only the extension of an existing route", () => {
    const start = { lng: 2.17, lat: 41.38, recordedAt: 1 };
    const middle = { lng: 2.1702, lat: 41.38, recordedAt: 2 };
    const end = { lng: 2.1708, lat: 41.38, recordedAt: 3 };

    const coordinates = appendedFogRouteCoordinates(
      [[start, middle]],
      [[start, middle, end]],
    );

    expect(coordinates).not.toBeNull();
    expect(coordinates?.at(-1)).toEqual([end.lng, end.lat]);
    expect(coordinates?.[0]).not.toEqual([start.lng, start.lat]);
  });

  it("rejects a route replacement so the layer can rebuild safely", () => {
    const start = { lng: 2.17, lat: 41.38, recordedAt: 1 };
    const replacement = { lng: -0.12, lat: 51.5, recordedAt: 1 };

    expect(
      appendedFogRouteCoordinates([[start]], [[replacement]]),
    ).toBeNull();
  });
});
