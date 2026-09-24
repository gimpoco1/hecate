import { describe, expect, it } from "vitest";
import {
  cityMilestoneProgress,
  earnedCityMilestones,
  nextCityMilestone,
} from "./badges";

describe("city stars", () => {
  it("awards cumulative stars at 5, 25, and 100 kilometres", () => {
    expect(earnedCityMilestones("barcelona", "Barcelona", 4.99)).toHaveLength(0);
    expect(
      earnedCityMilestones("barcelona", "Barcelona", 25).map(
        (star) => star.id,
      ),
    ).toEqual(["first-footprint", "pathfinder"]);
    expect(earnedCityMilestones("barcelona", "Barcelona", 99.99)).toHaveLength(2);
    expect(earnedCityMilestones("barcelona", "Barcelona", 100)).toHaveLength(3);
  });

  it("reports progress within the current tier instead of against lifetime distance", () => {
    expect(nextCityMilestone(5)?.thresholdKm).toBe(25);
    expect(cityMilestoneProgress(15).progress).toBe(0.5);
    expect(cityMilestoneProgress(100)).toEqual({ next: null, progress: 1 });
  });
});
