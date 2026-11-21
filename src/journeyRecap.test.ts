import { describe, expect, it } from "vitest";
import { discoveryJourneyMetrics, mergeRoutePoints, splitRoute } from "./geo";
import { createJourneyRecapRoute, journeyPauseBoundaries } from "./journeyRecap";
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

  it("keeps a visual gap when a resumed journey restarts elsewhere", () => {
    const pausedResume: PendingWalk = {
      ...completed,
      points: [
        { lng: 2.17, lat: 41.38, recordedAt: 1000 },
        { lng: 2.171, lat: 41.38, recordedAt: 61000 },
        { lng: 2.175, lat: 41.381, recordedAt: 121000, segmentBreakBefore: true, resumedAfterPause: true },
        { lng: 2.176, lat: 41.381, recordedAt: 181000 },
      ],
    };
    const route = createJourneyRecapRoute([], pausedResume);

    expect(splitRoute(route.points)).toHaveLength(2);
    expect(journeyPauseBoundaries(route.points)).toEqual([{
      pausedAt: route.points[1], resumedAt: route.points[2],
    }]);
  });
});


describe("journey pause boundaries", () => {
  it("does not infer pauses from long GPS gaps or separate journeys", () => {
    expect(journeyPauseBoundaries([
      { lng: 2.17, lat: 41.38, recordedAt: 1000, walkId: "first" },
      { lng: 2.18, lat: 41.38, recordedAt: 10000000, walkId: "first", segmentBreakBefore: true },
      { lng: 2.19, lat: 41.38, recordedAt: 10001000, walkId: "second", segmentBreakBefore: true, resumedAfterPause: true },
    ])).toEqual([]);
  });

  it("keeps every pause even when recording resumes in the same place", () => {
    const points = [
      { lng: 2.17, lat: 41.38, recordedAt: 1000, walkId: "walk" },
      { lng: 2.17, lat: 41.38, recordedAt: 61000, walkId: "walk", segmentBreakBefore: true, resumedAfterPause: true },
      { lng: 2.18, lat: 41.38, recordedAt: 121000, walkId: "walk" },
      { lng: 2.18, lat: 41.38, recordedAt: 181000, walkId: "walk", segmentBreakBefore: true, resumedAfterPause: true },
    ];
    expect(journeyPauseBoundaries(points)).toEqual([
      { pausedAt: points[0], resumedAt: points[1] },
      { pausedAt: points[2], resumedAt: points[3] },
    ]);
    expect(journeyPauseBoundaries(completed.points)).toEqual([]);
    expect(journeyPauseBoundaries([])).toEqual([]);
  });
});
