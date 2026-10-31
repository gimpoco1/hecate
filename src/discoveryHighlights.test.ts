import { describe, expect, it } from "vitest";
import { discoveredAreaKm2, discoveryCellAreaKm2, discoveryCellCenter, discoveryCellKey, discoveryFootprintCells, pointToDiscoveryCell } from "./geo";
import { discoveryHighlightData, newlyRevealedCells } from "./discoveryHighlights";

describe("discoveryHighlightData", () => {
  it("highlights the full new footprint while excluding overlap with previous discovery", () => {
    const previous = pointToDiscoveryCell({ lng: 2.17, lat: 41.38, recordedAt: 1 });
    const adjacent = { ...previous, x: previous.x + 1, discoveredAt: 2 };
    const known = new Set(discoveryFootprintCells(previous).map(discoveryCellKey));
    const expected = discoveryFootprintCells(adjacent).filter(cell => !known.has(discoveryCellKey(cell)));
    const highlighted = newlyRevealedCells([previous], [adjacent, adjacent]);

    expect(highlighted.map(discoveryCellKey).sort()).toEqual(expected.map(discoveryCellKey).sort());
    expect(highlighted.length).toBeGreaterThan(0);
    expect(highlighted.every(cell => !known.has(discoveryCellKey(cell)))).toBe(true);
    expect(highlighted.reduce((area, cell) => area + discoveryCellAreaKm2(cell), 0)).toBeCloseTo(
      discoveredAreaKm2([previous, adjacent]) - discoveredAreaKm2([previous]),
      10,
    );
    expect(discoveryHighlightData(highlighted).geometry.coordinates).toHaveLength(expected.length);
    expect(previous.discoveredAt).toBe(1);
  });

  it("does not highlight a repeat of an already revealed route", () => {
    const previous = pointToDiscoveryCell({ lng: 2.17, lat: 41.38, recordedAt: 1 });
    expect(newlyRevealedCells([previous], [{ ...previous, discoveredAt: 2 }])).toEqual([]);
  });

  it("keeps disconnected new areas separate and covers the first discovery footprint", () => {
    const first = pointToDiscoveryCell({ lng: 2.17, lat: 41.38, recordedAt: 1 });
    const second = pointToDiscoveryCell({ lng: 2.18, lat: 41.38, recordedAt: 2 });
    const highlighted = newlyRevealedCells([], [first, second]);
    expect(highlighted).toHaveLength(discoveryFootprintCells(first).length + discoveryFootprintCells(second).length);
    const data = discoveryHighlightData(highlighted);
    expect(data.geometry.coordinates.every(polygon => {
      const longitudes = polygon[0].map(position => position[0]);
      return Math.max(...longitudes) < 2.175 || Math.min(...longitudes) > 2.175;
    })).toBe(true);
  });

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
