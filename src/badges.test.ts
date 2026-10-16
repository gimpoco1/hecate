import { describe, expect, it } from "vitest";
import {
  cityMilestoneProgress,
  currentWorldMilestone,
  earnedCityMilestones,
  nextWorldMilestone,
  nextCityMilestone,
  worldMilestoneProgress,
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

describe("world milestones", () => {
  it("selects the current and next rank from total travelled distance", () => {
    expect(currentWorldMilestone(0).id).toBe("first-step");
    expect(currentWorldMilestone(42.2).id).toBe("marathon");
    expect(currentWorldMilestone(1_985).id).toBe("space-station");
    expect(nextWorldMilestone(1_985)?.id).toBe("across-the-moon");
  });

  it("finishes the ladder at the distance to the Moon", () => {
    expect(currentWorldMilestone(384_400).id).toBe("to-the-moon");
    expect(nextWorldMilestone(384_400)).toBeNull();
  });

  it("reports progress between the current and next world rank", () => {
    expect(worldMilestoneProgress(54)).toBeCloseTo(11.8 / 57.8);
    expect(worldMilestoneProgress(384_400)).toBe(1);
  });
});
