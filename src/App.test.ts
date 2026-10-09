import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoveryProgressCacheKey,
  loadCachedDiscoveryProgress,
} from "./App";

describe("discovery progress cache", () => {
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
        version: 1,
        userId: "user-42",
        discoveryDistance: "not-a-number",
        cityMetrics: [],
      }),
    );
    expect(loadCachedDiscoveryProgress("user-42")).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: "user-42",
        discoveryDistance: 42,
        cityMetrics: [{ cityId: "some-city", percentage: 42, distance: 10 }],
      }),
    );
    expect(loadCachedDiscoveryProgress("user-42")).toEqual({
      discoveryDistance: 42,
      cityMetrics: [{ cityId: "some-city", percentage: 42, distance: 10 }],
    });
  });
});
