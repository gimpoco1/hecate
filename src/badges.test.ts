import { describe, expect, it } from "vitest";
import { cityBadgeProgress, earnedCityBadges, nextCityBadge } from "./badges";

describe("city passport badges", () => {
  it("awards cumulative badges at 1, 5, and 20 kilometres", () => {
    expect(earnedCityBadges("barcelona", "Barcelona", 0.99)).toHaveLength(0);
    expect(
      earnedCityBadges("barcelona", "Barcelona", 5).map(
        (badge) => badge.id,
      ),
    ).toEqual(["first-footprint", "pathfinder"]);
    expect(earnedCityBadges("barcelona", "Barcelona", 20)).toHaveLength(3);
  });

  it("reports progress within the current tier instead of against lifetime distance", () => {
    expect(nextCityBadge(1)?.thresholdKm).toBe(5);
    expect(cityBadgeProgress(3).progress).toBe(0.5);
    expect(cityBadgeProgress(20)).toEqual({ next: null, progress: 1 });
  });
});
