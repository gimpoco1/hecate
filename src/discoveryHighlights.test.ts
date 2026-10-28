import { describe, expect, it } from "vitest";
import { discoveryCellCenter, pointToDiscoveryCell } from "./geo";
import { discoveryHighlightData } from "./discoveryHighlights";

describe("discoveryHighlightData", () => {
  it("highlights separate discoveries without covering the known area between them", () => {
    const first = pointToDiscoveryCell({ lng: 2.17, lat: 41.38, recordedAt: 1 });
    const second = pointToDiscoveryCell({ lng: 2.18, lat: 41.38, recordedAt: 2 });
    const data = discoveryHighlightData([first, second]);

    expect(data.geometry.type).toBe("MultiPolygon");
    expect(data.geometry.coordinates).toHaveLength(2);
    data.geometry.coordinates.forEach((polygon, index) => {
      const ring = polygon[0];
      const longitudes = ring.map(([lng]) => lng);
      const latitudes = ring.map(([, lat]) => lat);
      const [lng, lat] = discoveryCellCenter([first, second][index]);
      expect(Math.min(...longitudes)).toBeLessThan(lng);
      expect(Math.max(...longitudes)).toBeGreaterThan(lng);
      expect(Math.min(...latitudes)).toBeLessThan(lat);
      expect(Math.max(...latitudes)).toBeGreaterThan(lat);
      expect(ring.at(-1)).toEqual(ring[0]);
      expect(2.175 < Math.min(...longitudes) || 2.175 > Math.max(...longitudes)).toBe(true);
    });
  });
});
