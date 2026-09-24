import { beforeEach, describe, expect, it } from "vitest";
import { reconcileDiscoveryAchievementUnlocks } from "./achievementDelivery";
import type { Coordinate } from "./types";

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

describe("background achievement delivery", () => {
  it("detects and persists an unlock without a React state update", () => {
    reconcileDiscoveryAchievementUnlocks("walker", [], []);
    const startedAt = Date.UTC(2026, 8, 1, 10);
    const points: Coordinate[] = Array.from({ length: 241 }, (_, index) => ({
      lng: index * 0.0004,
      lat: 0,
      recordedAt: startedAt + index * 10_000,
      accuracy: 5,
      walkId: "background-walk",
    }));

    const unlocks = reconcileDiscoveryAchievementUnlocks("walker", points, []);

    expect(unlocks.newlyEarned).toContain("the-long-way");
    expect(unlocks.pending).toContain("the-long-way");
  });
});
