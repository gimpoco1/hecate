import { describe, expect, it } from "vitest";
import type { DiscoveryJourneyMetric } from "./geo";
import { walkingStatsFromJourneys } from "./walkingStats";

function journey(day: number, travelledKm: number): DiscoveryJourneyMetric {
  const startedAt = Date.UTC(2026, 9, day, 9);
  return {
    journeyId: `walk-${day}`,
    points: [],
    startedAt,
    finishedAt: startedAt + 60 * 60 * 1_000,
    travelledKm,
    newGroundKm: travelledKm / 2,
  };
}

describe("walking stats", () => {
  it("calculates personal bests and an active streak", () => {
    const stats = walkingStatsFromJourneys(
      [journey(12, 3), journey(13, 8), journey(14, 4), journey(16, 5)],
      Date.UTC(2026, 9, 16, 18),
    );

    expect(stats).toEqual({
      walkCount: 4,
      longestWalkKm: 8,
      longestWalkFinishedAt: Date.UTC(2026, 9, 13, 10),
      averageWalkKm: 5,
      currentStreakDays: 1,
      bestStreakDays: 3,
      firstWalkAt: Date.UTC(2026, 9, 12, 9),
    });
  });

  it("ends the current streak after a missed day", () => {
    const stats = walkingStatsFromJourneys(
      [journey(12, 3), journey(13, 4)],
      Date.UTC(2026, 9, 16, 18),
    );

    expect(stats.currentStreakDays).toBe(0);
    expect(stats.bestStreakDays).toBe(2);
  });
});
