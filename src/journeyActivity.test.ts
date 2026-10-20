import { describe, expect, it } from "vitest";
import { journeyActionFromUrl, journeyActivitySnapshot } from "./journeyActivity";
import { discoveredDistanceKm, routeDistanceKm } from "./geo";
import type { Coordinate } from "./types";

const points: Coordinate[] = [
  { lng: 0, lat: 0, accuracy: 5, recordedAt: 1000, walkId: "walk" },
  { lng: 0.001, lat: 0, accuracy: 5, recordedAt: 61000, walkId: "walk" },
];

describe("journey Live Activity", () => {
  it("matches the recorded distance and new-ground metres in the recap", () => {
    const snapshot = journeyActivitySnapshot({ id: "walk", startedAt: 1000, points }, 0, points);
    expect(snapshot.walkId).toBe("walk");
    expect(snapshot.startedAt).toBe(1000);
    expect(snapshot.distanceKm).toBe(routeDistanceKm(points));
    expect(snapshot.newGroundMeters).toBeCloseTo(discoveredDistanceKm(points) * 1000);
    expect(snapshot.newGroundMeters).toBeGreaterThan(0);
  });

  it("keeps new ground at zero on previously discovered routes", () => {
    const retraced = points.map(point => ({ ...point, walkId: "next", recordedAt: point.recordedAt + 120000 }));
    expect(journeyActivitySnapshot(
      { id: "next", startedAt: 121000, points: retraced }, discoveredDistanceKm(points), [...points, ...retraced],
    ).newGroundMeters).toBeCloseTo(0);
  });

  it("does not let a lower recomputed discovery total produce negative new ground", () => {
    expect(journeyActivitySnapshot({ id: "walk", startedAt: 1000, points }, 1, points).newGroundMeters).toBe(0);
  });

  it("handles an empty journey before the first GPS fix", () => {
    expect(journeyActivitySnapshot(
      { id: "walk", startedAt: 1000, points: [] }, 0, [],
    )).toEqual({ walkId: "walk", startedAt: 1000, distanceKm: 0, newGroundMeters: 0 });
  });

  it("accepts only journey links with a walk ID and a known action", () => {
    expect(journeyActionFromUrl("hecate://journey/stop?walkId=walk")).toEqual({ walkId: "walk", action: "stop" });
    expect(journeyActionFromUrl("hecate://journey/open?walkId=walk")).toEqual({ walkId: "walk", action: "open" });
    for (const value of ["invalid", "https://journey/stop?walkId=walk", "hecate://auth/stop?walkId=walk", "hecate://journey/stop", "hecate://journey/delete?walkId=walk"]) {
      expect(journeyActionFromUrl(value)).toBeNull();
    }
  });
});
