import { describe, expect, it } from "vitest";
import type { DiscoveryJourneyMetric } from "./geo";
import { weeklyJourneyActivity } from "./weeklyJourneyActivity";

function journey(id: string, finishedAt: number, travelledKm: number, newGroundKm: number): DiscoveryJourneyMetric {
  return { journeyId: id, points: [], startedAt: finishedAt - 60000, finishedAt, travelledKm, newGroundKm };
}

describe("weekly journey activity", () => {
  const now = new Date(2026, 10, 8, 18).getTime();

  it("uses distance-weighted discovery ratio and counts each active calendar day once", () => {
    const activity = weeklyJourneyActivity([
      journey("first", new Date(2026, 10, 2, 10).getTime(), 1, 1),
      journey("second", new Date(2026, 10, 2, 14).getTime(), 9, 0),
      journey("third", new Date(2026, 10, 4, 12).getTime(), 2, 2),
      journey("stationary", new Date(2026, 10, 5, 12).getTime(), 0, 0),
      journey("previous-week", new Date(2026, 10, 1, 23, 59).getTime(), 10, 10),
      journey("next-week", new Date(2026, 10, 9).getTime(), 10, 10),
    ], now);
    expect(activity.discoveryRatio).toBe(.25);
    expect(activity.journeyCount).toBe(4);
    expect(activity.travelledKm).toBe(12);
    expect(activity.newGroundKm).toBe(3);
    expect(activity.durationMs).toBe(240000);
    expect(activity.activeDays).toBe(2);
    expect(activity.days.map(day => day.travelledKm)).toEqual([10, 0, 2, 0, 0, 0, 0]);
    expect(activity.days.map(day => day.journeyCount)).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });

  it("keeps an empty ratio distinct from a familiar-only week", () => {
    expect(weeklyJourneyActivity([], now).discoveryRatio).toBeNull();
    const familiar = weeklyJourneyActivity([journey("familiar", now, 5, 0)], now);
    expect(familiar.discoveryRatio).toBe(0);
    expect(familiar.activeDays).toBe(1);
  });

  it("retains daily new-ground amounts independently of travelled distance", () => {
    const tied = weeklyJourneyActivity([
      journey("first", new Date(2026, 10, 2, 10).getTime(), 2, .5),
      journey("second", new Date(2026, 10, 3, 10).getTime(), 4, .5),
    ], now);
    expect(tied.days.slice(0, 2).map(day => ({ travelledKm: day.travelledKm, newGroundKm: day.newGroundKm }))).toEqual([{ travelledKm: 2, newGroundKm: .5 }, { travelledKm: 4, newGroundKm: .5 }]);
    expect(weeklyJourneyActivity([journey("familiar", now, 5, 0)], now).days.every(day => day.newGroundKm === 0)).toBe(true);
  });

  it("uses local finish dates at a week boundary and calendar midnights across DST", () => {
    const monday = new Date(2026, 9, 26).getTime();
    const activity = weeklyJourneyActivity([journey("cross-midnight", monday, 1, .5)], monday);
    expect(activity.days[0].startedAt).toBe(monday);
    expect(activity.days[0].journeyCount).toBe(1);
    expect(activity.days[6].startedAt).toBe(new Date(2026, 10, 1).getTime());
    expect(activity.activeDays).toBe(1);
  });
});
