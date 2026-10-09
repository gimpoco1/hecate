import { describe, expect, it } from "vitest";
import {
  compactImportedRoute,
  persistImportedDiscovery,
  storedWalkRoutes,
  walkIsAlreadyStored,
} from "./gpx";
import type { Coordinate, PendingWalk } from "./types";

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
