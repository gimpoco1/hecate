import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissAchievementUnlock,
  reconcileAchievementUnlocks,
} from "./achievementUnlocks";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

describe("achievement unlock delivery", () => {
  it("uses existing achievements as the initial baseline", () => {
    expect(reconcileAchievementUnlocks("user-1", ["the-long-way"])).toEqual({
      newlyEarned: [],
      pending: [],
    });
  });

  it("persists new unlocks until each celebration is dismissed", () => {
    reconcileAchievementUnlocks("user-1", []);
    expect(
      reconcileAchievementUnlocks("user-1", [
        "the-long-way",
        "three-day-spark",
      ]),
    ).toEqual({
      newlyEarned: ["the-long-way", "three-day-spark"],
      pending: ["the-long-way", "three-day-spark"],
    });

    dismissAchievementUnlock("user-1", "the-long-way");
    expect(
      reconcileAchievementUnlocks("user-1", [
        "the-long-way",
        "three-day-spark",
      ]),
    ).toEqual({ newlyEarned: [], pending: ["three-day-spark"] });
  });

  it("keeps unlock state separate for each account", () => {
    reconcileAchievementUnlocks("user-1", []);
    reconcileAchievementUnlocks("user-1", ["momentum"]);
    expect(reconcileAchievementUnlocks("user-2", ["momentum"])).toEqual({
      newlyEarned: [],
      pending: [],
    });
  });

  it("drops achievements that no longer meet revised criteria so they can be earned again", () => {
    reconcileAchievementUnlocks("user-1", []);
    reconcileAchievementUnlocks("user-1", ["the-long-way"]);
    dismissAchievementUnlock("user-1", "the-long-way");

    expect(reconcileAchievementUnlocks("user-1", [])).toEqual({
      newlyEarned: [],
      pending: [],
    });
    expect(reconcileAchievementUnlocks("user-1", ["the-long-way"])).toEqual({
      newlyEarned: ["the-long-way"],
      pending: ["the-long-way"],
    });
  });
});
