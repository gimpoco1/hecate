import { expect, it } from "vitest";
import geometry from "./regions/barcelona-metropolitan.json";
import { cityPointPredicate, isPointInCity } from "./city";
import { leaderboardSnapshotFromDiscovery } from "./leaderboardSnapshot";
import { discoveryCellsFromPoints } from "./geo";
import type { Coordinate } from "./types";
import type { CityBoundary } from "./city";

it("publishes a substantial history against the full Barcelona boundary", () => {
  const points: Coordinate[] = Array.from({ length: 4000 }, (_, index) => ({
    lng: 2.10 + (index % 200) * 0.0002,
    lat: 41.36 + Math.floor(index / 200) * 0.0004,
    recordedAt: index * 10000,
    walkId: `journey-${Math.floor(index / 200)}`,
  }));
  const city: CityBoundary = { id: "region:barcelona-metropolitan", name: "Barcelona", fetchedAt: 0, geometry: geometry as CityBoundary["geometry"] };
  const snapshot = leaderboardSnapshotFromDiscovery(points, discoveryCellsFromPoints(points), [city], "UTC");
  expect(snapshot.totalDiscoveredKm).toBeCloseTo(66.09635083868332, 10);
  expect(snapshot.cities[0].discoveredKm).toBeCloseTo(66.09635083868332, 10);
  expect(snapshot.cities[0].discoveredPercentage).toBeCloseTo(0.506439951479839, 10);
  expect(snapshot.achievements).toEqual([]);
});

it("keeps indexed coastline containment identical to the full polygon scan", () => {
  const city: CityBoundary = { id: "region:barcelona-metropolitan", name: "Barcelona", fetchedAt: 0, geometry: geometry as CityBoundary["geometry"] };
  const contains = cityPointPredicate(city);
  for (let x = 0; x < 80; x += 1) {
    for (let y = 0; y < 80; y += 1) {
      const point = { lng: 1.84 + x * 0.006, lat: 41.25 + y * 0.004 };
      expect(contains(point)).toBe(isPointInCity(point, city));
    }
  }
});

it("preserves holes, polygon islands, and vertex boundaries in the index", () => {
  const city: CityBoundary = {
    id: "islands", name: "Islands", fetchedAt: 0,
    geometry: { type: "MultiPolygon", coordinates: [
      [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]],
      [[[5, 0], [6, 0], [6, 1], [5, 1], [5, 0]]],
    ] },
  };
  const contains = cityPointPredicate(city);
  for (let x = -1; x <= 14; x += 1) {
    for (let y = -1; y <= 10; y += 1) {
      const point = { lng: x / 2, lat: y / 2 };
      expect(contains(point)).toBe(isPointInCity(point, city));
    }
  }
});
