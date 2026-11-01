import { describe, expect, it } from "vitest";
import { discoveryJourneyMetrics, mergeRoutePoints } from "./geo";
import { createJourneyRecapRoute } from "./journeyRecap";
import type { PendingWalk } from "./types";

const completed: PendingWalk = {
  id: "restored", startedAt: 1000, finishedAt: 61000,
  points: [{ lng: 2.17, lat: 41.38, recordedAt: 1000 }, { lng: 2.171, lat: 41.38, recordedAt: 61000 }],
};

describe("recap geometry", () => {
  it("handles completed journal points without per-point journey IDs", () => {
    expect(discoveryJourneyMetrics(mergeRoutePoints([], completed.points)).find(journey => journey.journeyId === completed.id)).toBeUndefined();
    const route = createJourneyRecapRoute([], completed);
    expect(route.points).toEqual(completed.points.map(point => ({ ...point, walkId: completed.id })));
    expect(route.newGroundSegments.length).toBeGreaterThan(0);
    expect(route.bounds).toEqual({ west: 2.17, east: 2.171, south: 41.38, north: 41.38 });
    expect(completed.points[0].walkId).toBeUndefined();
  });

  it("keeps the full route when no ground is new and excludes unrelated journeys", () => {
    const previous = completed.points.map(point => ({ ...point, walkId: "previous", recordedAt: point.recordedAt - 120000 }));
    const route = createJourneyRecapRoute(previous, completed);
    expect(route.newGroundSegments).toEqual([]);
    expect(route.points).toHaveLength(2);
    expect(route.points.every(point => point.walkId === completed.id)).toBe(true);
  });

  it("rejects incomplete recaps before they are placed in UI state", () => {
    expect(() => createJourneyRecapRoute([], { ...completed, points: [] })).toThrow(RangeError);
  });
});
