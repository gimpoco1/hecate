import { describe, expect, it } from "vitest";
import {
  evaluateAchievementsFromJourneys,
  type AchievementEvaluation,
} from "./achievements";
import type { DiscoveryJourneyMetric } from "./geo";

function journey(
  day: number,
  overrides: Partial<DiscoveryJourneyMetric> = {},
) {
  const startedAt = Date.UTC(2026, 8, day, 10);
  const result = {
    journeyId: `walk-${day}`,
    points: [
      { lng: 2, lat: 41, recordedAt: startedAt },
      { lng: 2.001, lat: 41, recordedAt: startedAt + 60_000 },
    ],
    startedAt,
    finishedAt: startedAt + 60_000,
    travelledKm: 1,
    newGroundKm: 0.25,
    ...overrides,
  };
  return {
    ...result,
    newGroundKmByRegion: overrides.newGroundKmByRegion ?? {
      barcelona: result.newGroundKm,
    },
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
            travelledKm: 9,
            newGroundKm: 8.2,
          }),
          journey(2, {
            travelledKm: 5.2,
            newGroundKm: 4.2,
            points: [
              { lng: 2, lat: 41, recordedAt: Date.UTC(2026, 8, 2, 10) },
              { lng: 2.0005, lat: 41, recordedAt: Date.UTC(2026, 8, 2, 11) },
            ],
          }),
          journey(3, {
            travelledKm: 5.5,
            newGroundKm: 2.2,
            points: [
              { lng: 2, lat: 41, recordedAt: Date.UTC(2026, 8, 3, 10) },
              { lng: 2.0005, lat: 41, recordedAt: Date.UTC(2026, 8, 3, 11) },
            ],
          }),
          journey(4, {
            travelledKm: 8,
            newGroundKm: 4,
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
          journey(1, { newGroundKm: 0.5 }),
          journey(2, { newGroundKm: 0.5 }),
          journey(3, { newGroundKm: 0.5 }),
          journey(5, { newGroundKm: 0.5 }),
          journey(7, { newGroundKm: 0.5 }),
          journey(9, { newGroundKm: 0.5 }),
          journey(11, { newGroundKm: 0.5 }),
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
        Array.from({ length: 10 }, (_, index) =>
          journey(index + 1, { newGroundKm: 0.5 }),
        ),
        [
          { cityId: "barcelona", discoveredKm: 3 },
          { cityId: "london", discoveredKm: 2.7 },
          { cityId: "new-york", discoveredKm: 2.5 },
          { cityId: "paris", discoveredKm: 2.2 },
          { cityId: "rome", discoveredKm: 2 },
        ],
      ),
    );

    expect(results["local-ritual"].earned).toBe(true);
    expect(results["city-hopper"].earned).toBe(true);
  });

  it("requires the qualifying daily distance to be inside the same city", () => {
    const results = byId(
      evaluateAchievementsFromJourneys(
        Array.from({ length: 10 }, (_, index) =>
          journey(index + 1, {
            newGroundKm: 0.6,
            newGroundKmByRegion: { barcelona: 0.2, badalona: 0.4 },
          }),
        ),
        [],
      ),
    );

    expect(results["local-ritual"].earned).toBe(false);
    expect(results["local-ritual"].progressLabel).toBe("0 of 10 days in one city");
  });

  it("combines multiple discoveries in the same city on the same day", () => {
    const journeys = Array.from({ length: 10 }, (_, index) => [
      journey(index + 1, {
        journeyId: `walk-${index + 1}-a`,
        newGroundKm: 0.3,
        newGroundKmByRegion: { barcelona: 0.3 },
      }),
      journey(index + 1, {
        journeyId: `walk-${index + 1}-b`,
        newGroundKm: 0.3,
        newGroundKmByRegion: { barcelona: 0.3 },
      }),
    ]).flat();

    const results = byId(evaluateAchievementsFromJourneys(journeys, []));
    expect(results["local-ritual"].earned).toBe(true);
  });
});
