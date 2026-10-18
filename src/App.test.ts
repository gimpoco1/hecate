import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoveryProgressCacheKey,
  journeyPercentageCounter,
  journeyTimeCounter,
  loadCachedDiscoveryProgress,
  saveCachedDiscoveryProgress,
} from "./App";
import { emptyWalkingStats } from "./walkingStats";

describe("journey counters", () => {
  it("shows elapsed minutes and seconds from the original walk start", () => {
    expect(journeyTimeCounter(4 * 60_000 + 32_000)).toMatchObject({
      text: "4:32",
      label: "4 minutes, 32 seconds",
    });
  });

  it.each([
    [-1000, "0:00"], [0, "0:00"], [59_000, "0:59"], [60_000, "1:00"],
    [3_599_000, "59:59"], [3_600_000, "1:00:00"], [3_661_000, "1:01:01"],
  ])("formats %i milliseconds without rounding up", (elapsed, text) => {
    expect(journeyTimeCounter(elapsed).text).toBe(text);
  });

  it("keeps new-area progress at two decimal places", () => {
    expect(journeyPercentageCounter(0.08)).toEqual({
      value: 0.08,
      places: [1, ".", 0.1, 0.01],
      prefix: "+",
      suffix: "%",
      label: "Plus 0.08 percent new area",
    });
  });
});

describe("discovery progress cache", () => {
  const baseWalkingStats = {
    walkCount: 4,
    longestWalkKm: 20,
    longestWalkFinishedAt: 2,
    averageWalkKm: 15,
    currentStreakDays: 1,
    bestStreakDays: 3,
    firstWalkAt: 1,
  } as const;

  const baseDiscoveryProgress = {
    discoveryDistance: 42,
    travelledDistance: 60,
    walkingStats: baseWalkingStats,
    todayDiscoveryDistance: 1.2,
    todayTravelledDistance: 4.8,
    todayActiveTimeMs: 3_600_000,
    weekDiscoveryDistance: 7.3,
    weekActiveTimeMs: 10_800_000,
    weekDiscoveryDeltaDistance: -2.9,
    weekActiveDeltaTimeMs: -7_200_000,
    cityMetrics: [] as Array<{ cityId: string; percentage: number; distance: number }>,
  };

  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  it("treats malformed or invalid cache entries as a miss", () => {
    const key = discoveryProgressCacheKey("user-42");

    localStorage.setItem(key, "{not valid json");
    expect(loadCachedDiscoveryProgress("user-42")).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 5,
        userId: "user-42",
        ...baseDiscoveryProgress,
        discoveryDistance: "not-a-number",
      }),
    );
    expect(loadCachedDiscoveryProgress("user-42")).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 5,
        userId: "user-42",
        ...baseDiscoveryProgress,
        walkingStats: {
          ...emptyWalkingStats(),
          averageWalkKm: "not-a-number",
        },
      }),
    );
    expect(loadCachedDiscoveryProgress("user-42")).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 5,
        userId: "user-42",
        ...baseDiscoveryProgress,
        cityMetrics: [{ cityId: "some-city", percentage: 42, distance: 10 }],
      }),
    );
    expect(loadCachedDiscoveryProgress("user-42")).toEqual({
      ...baseDiscoveryProgress,
      cityMetrics: [{ cityId: "some-city", percentage: 42, distance: 10 }],
    });
  });

  it("reports a cache write failure without blocking computed progress", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      },
      removeItem: () => undefined,
    });

    expect(() =>
      saveCachedDiscoveryProgress("user-42", {
        ...baseDiscoveryProgress,
        walkingStats: emptyWalkingStats(),
      }),
    ).not.toThrow();
    expect(warning).toHaveBeenCalledWith("Could not cache discovery progress", {
      userId: "user-42",
      error: "Storage quota exceeded",
    });
  });
});
