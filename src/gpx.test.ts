import { describe, expect, it } from "vitest";
import {
  compactImportedRoute,
  importedRouteProgress,
  importedRouteHighlights,
  persistImportedDiscovery,
  storedWalkRoutes,
  walkIsAlreadyStored,
} from "./gpx";
import type { Coordinate, PendingWalk } from "./types";
import { discoveryJourneyMetrics, discoveredDistanceKm, routeDistanceKm } from "./geo";

const importedPoints: Coordinate[] = [
  { lat: 41.1, lng: 2.1, recordedAt: 1, walkId: "stored-walk" },
  { lat: 41.2, lng: 2.2, recordedAt: 2, walkId: "stored-walk" },
];

function candidateWalk(id: string, points: Coordinate[]): PendingWalk {
  return {
    id,
    startedAt: points[0].recordedAt,
    finishedAt: points.at(-1)!.recordedAt,
    points,
    achievementEligible: false,
  };
}

describe("GPX duplicate detection", () => {
  it("recognizes a stable walk ID", () => {
    const routes = storedWalkRoutes(importedPoints);

    expect(
      walkIsAlreadyStored(candidateWalk("stored-walk", importedPoints), routes),
    ).toBe(true);
  });

  it("recognizes the same coordinates from an older random import ID", () => {
    const routes = storedWalkRoutes(importedPoints);
    const samePoints = importedPoints.map(({ lat, lng, recordedAt }) => ({
      lat,
      lng,
      recordedAt: recordedAt + 10_000,
    }));

    expect(
      walkIsAlreadyStored(candidateWalk("new-stable-id", samePoints), routes),
    ).toBe(true);
  });

  it("allows a distinct route", () => {
    const routes = storedWalkRoutes(importedPoints);
    const differentPoints = [
      importedPoints[0],
      { ...importedPoints[1], lng: 2.3 },
    ];

    expect(
      walkIsAlreadyStored(
        candidateWalk("different-walk", differentPoints),
        routes,
      ),
    ).toBe(false);
  });

  it("compacts dense display routes while preserving both endpoints", () => {
    const points = Array.from({ length: 101 }, (_, index) => ({
      lat: 41,
      lng: 2 + index * 0.000001,
      recordedAt: index,
    }));

    const compacted = compactImportedRoute(points, 5);

    expect(compacted.length).toBeLessThan(10);
    expect(compacted[0]).toBe(points[0]);
    expect(compacted.at(-1)).toBe(points.at(-1));
  });
});

describe("GPX import persistence", () => {
  it("credits overlapping imported segments only for the new ground they add", () => {
    const points = Array.from({ length: 21 }, (_, index) => ({
      lat: 41,
      lng: 2 + index * 0.0001,
      recordedAt: index * 1_000,
    }));
    const first = candidateWalk("first", points);
    const repeated = candidateWalk("repeated", points.map(point => ({
      ...point,
      recordedAt: point.recordedAt + 60_000,
    })));
    const result = importedRouteProgress([], [first, repeated]);

    expect(result.newGroundKmByWalk.get("first")).toBeGreaterThan(0);
    expect(result.newGroundKmByWalk.get("repeated")).toBe(0);
    expect(result.addedKm).toBeCloseTo(discoveredDistanceKm(result.points));
    expect(result.addedKm).toBeCloseTo(
      [...result.newGroundKmByWalk.values()].reduce((total, km) => total + km, 0),
    );
    expect(result.addedKm).toBeLessThan(routeDistanceKm(result.points));
    expect(first.points).toBe(points);
    expect(points.every(point => !("walkId" in point))).toBe(true);

    const subsequent = importedRouteProgress(result.points, [
      candidateWalk("another-import", points.map(point => ({
        ...point,
        recordedAt: point.recordedAt + 120_000,
      }))),
    ]);
    expect(subsequent.addedKm).toBe(0);
    expect(subsequent.newGroundKmByWalk.get("another-import")).toBe(0);
  });

  it("persists discovery cells before marking any route as stored", async () => {
    const operations: string[] = [];
    const walks = [
      candidateWalk("first-walk", importedPoints),
      candidateWalk("second-walk", importedPoints),
    ];

    await persistImportedDiscovery(
      [],
      walks,
      async () => {
        operations.push("cells");
      },
      async (walk) => {
        operations.push(walk.id);
      },
    );

    expect(operations).toEqual(["cells", "first-walk", "second-walk"]);
  });

  it("does not save a route when discovery-cell persistence fails", async () => {
    const savedWalkIds: string[] = [];

    await expect(
      persistImportedDiscovery(
        [],
        [candidateWalk("unsaved-walk", importedPoints)],
        async () => {
          throw new Error("cell sync failed");
        },
        async (walk) => {
          savedWalkIds.push(walk.id);
        },
      ),
    ).rejects.toThrow("cell sync failed");
    expect(savedWalkIds).toEqual([]);
  });
});

describe("imported route map highlights", () => {
  const first = [
    { lng: 2.17, lat: 41.38, recordedAt: 1000, walkId: "import-first", achievementEligible: false },
    { lng: 2.171, lat: 41.38, recordedAt: 61000, walkId: "import-first", achievementEligible: false },
  ];
  const second = first.map(point => ({ ...point, lat: point.lat + .01, recordedAt: point.recordedAt + 120000, walkId: "import-second" }));
  const history = [...first, ...second];

  it("matches the history card for a selected imported journey", () => {
    const highlights = importedRouteHighlights(history, first);
    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights).toEqual(discoveryJourneyMetrics(history)[0].newGroundSegments);
    expect(highlights.every(segment => segment.every(point => point.lat === first[0].lat))).toBe(true);
  });

  it("highlights all segments selected by the import confirmation", () => {
    expect(importedRouteHighlights(history, history)).toEqual(discoveryJourneyMetrics(history).flatMap(journey => journey.newGroundSegments));
  });

  it("does not highlight familiar ground on a repeated import", () => {
    const repeated = first.map(point => ({ ...point, recordedAt: point.recordedAt + 240000, walkId: "repeat" }));
    expect(importedRouteHighlights([...history, ...repeated], repeated)).toEqual([]);
  });
});
