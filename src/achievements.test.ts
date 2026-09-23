import { describe, expect, it } from "vitest";
import {
  evaluateAchievementsFromJourneys,
  type AchievementEvaluation,
} from "./achievements";
import type { DiscoveryJourneyMetric } from "./geo";

function journey(
  day: number,
  overrides: Partial<DiscoveryJourneyMetric & { cityId: string | null }> = {},
) {
  const startedAt = Date.UTC(2026, 8, day, 10);
  return {
    journeyId: `walk-${day}`,
    points: [
      { lng: 2, lat: 41, recordedAt: startedAt },
      { lng: 2.001, lat: 41, recordedAt: startedAt + 60_000 },
    ],
    startedAt,
    finishedAt: startedAt + 60_000,
    travelledKm: 1,
    newGroundKm: 0.25,
    cityId: "barcelona",
    ...overrides,
  };
}

function byId(evaluations: AchievementEvaluation[]) {
  return Object.fromEntries(
    evaluations.map((evaluation) => [evaluation.definition.id, evaluation]),
  );
}

describe("personal achievements", () => {
  it("awards distinct single-walk achievements from canonical journey totals", () => {
    const results = byId(
      evaluateAchievementsFromJourneys(
        [
          journey(1, {
            travelledKm: 5,
            newGroundKm: 4.2,
          }),
          journey(2, {
            travelledKm: 2.2,
            newGroundKm: 1.8,
            points: [
              { lng: 2, lat: 41, recordedAt: Date.UTC(2026, 8, 2, 10) },
              { lng: 2.0005, lat: 41, recordedAt: Date.UTC(2026, 8, 2, 11) },
            ],
          }),
          journey(3, {
            travelledKm: 3,
            newGroundKm: 1.2,
          }),
        ],
        [],
      ),
    );

    expect(results["the-long-way"].earned).toBe(true);
    expect(results["mostly-uncharted"].earned).toBe(true);
    expect(results["full-circle"].earned).toBe(true);
    expect(results["against-the-familiar"].earned).toBe(true);
  });

  it("requires meaningful new ground on each streak day", () => {
    const results = byId(
      evaluateAchievementsFromJourneys(
        [
          journey(1),
          journey(2),
          journey(3),
          journey(5),
          journey(6),
        ],
        [],
      ),
    );

    expect(results["three-day-spark"].earned).toBe(true);
    expect(results.momentum.earned).toBe(true);
  });

  it("awards place achievements from separate qualifying days and cities", () => {
    const results = byId(
      evaluateAchievementsFromJourneys(
        [journey(1), journey(2), journey(3), journey(4), journey(5)],
        [
          { cityId: "barcelona", discoveredKm: 1 },
          { cityId: "london", discoveredKm: 0.7 },
          { cityId: "new-york", discoveredKm: 0.5 },
        ],
      ),
    );

    expect(results["local-ritual"].earned).toBe(true);
    expect(results["city-hopper"].earned).toBe(true);
  });
});
