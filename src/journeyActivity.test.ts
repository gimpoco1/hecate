import { describe, expect, it } from "vitest";
import { journeyActionFromUrl, journeyActivitySnapshot } from "./journeyActivity";
import { discoveryCellKey, pointToDiscoveryCell, routeDistanceKm } from "./geo";
import { discoveredCityPercentage, type CityBoundary } from "./city";
import type { Coordinate } from "./types";

const city: CityBoundary = {
  id: "city",
  name: "City",
  fetchedAt: 0,
  geometry: {
    type: "Polygon",
    coordinates: [[[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01], [-0.01, -0.01]]],
  },
};
const points: Coordinate[] = [
  { lng: 0, lat: 0, accuracy: 5, recordedAt: 1000, walkId: "walk" },
  { lng: 0.001, lat: 0, accuracy: 5, recordedAt: 61000, walkId: "walk" },
];

describe("journey Live Activity", () => {
  it("matches the recorded distance and city percentage shown in the journey panel", () => {
    const cells = points.map(pointToDiscoveryCell);
    const startingCells = new Set([discoveryCellKey(cells[0])]);
    const snapshot = journeyActivitySnapshot({ id: "walk", startedAt: 1000, points }, startingCells, cells, city);
    expect(snapshot.walkId).toBe("walk");
    expect(snapshot.startedAt).toBe(1000);
    expect(snapshot.distanceKm).toBe(routeDistanceKm(points));
    expect(snapshot.newAreaPercentage).toBeCloseTo(
      discoveredCityPercentage(cells, city) - discoveredCityPercentage([cells[0]], city),
    );
    expect(startingCells.size).toBe(1);
  });

  it("keeps new area at zero when walking through previously discovered cells", () => {
    const cells = points.map(pointToDiscoveryCell);
    const startingCells = new Set(cells.map(discoveryCellKey));
    expect(journeyActivitySnapshot({ id: "walk", startedAt: 1000, points }, startingCells, cells, city).newAreaPercentage).toBe(0);
  });

  it("does not label travel outside a recognized city with a city percentage", () => {
    const outside = [{ ...points[0], lat: 20 }, { ...points[1], lat: 20 }];
    expect(journeyActivitySnapshot(
      { id: "walk", startedAt: 1000, points: outside }, new Set(), [], city,
    ).newAreaPercentage).toBeNull();
  });

  it("handles an empty journey before the first GPS fix", () => {
    expect(journeyActivitySnapshot(
      { id: "walk", startedAt: 1000, points: [] }, new Set(), [], null,
    )).toEqual({ walkId: "walk", startedAt: 1000, distanceKm: 0, newAreaPercentage: null });
  });

  it("accepts only journey links with a walk ID and a known action", () => {
    expect(journeyActionFromUrl("hecate://journey/stop?walkId=walk")).toEqual({ walkId: "walk", action: "stop" });
    expect(journeyActionFromUrl("hecate://journey/open?walkId=walk")).toEqual({ walkId: "walk", action: "open" });
    for (const value of ["invalid", "https://journey/stop?walkId=walk", "hecate://auth/stop?walkId=walk", "hecate://journey/stop", "hecate://journey/delete?walkId=walk"]) {
      expect(journeyActionFromUrl(value)).toBeNull();
    }
  });
});
