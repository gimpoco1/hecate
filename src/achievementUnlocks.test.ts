import { beforeEach, describe, expect, it } from "vitest";
import {
  confirmedPendingAchievementIds,
  dismissAchievementUnlock,
  isAchievementUnlockPending,
  loadAchievementUnlocks,
  reconcileAchievementUnlocks,
  syncAchievementUnlocks,
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
  it("excludes pending celebrations that are not currently earned", () => {
    expect(
      confirmedPendingAchievementIds(
        ["the-long-way", "momentum", "city-hopper"],
        ["momentum"],
      ),
    ).toEqual(["momentum"]);
  });

  it("removes unconfirmed pending celebrations from local state", async () => {
    reconcileAchievementUnlocks("user-1", []);
    reconcileAchievementUnlocks("user-1", [
      "the-long-way",
      "momentum",
      "city-hopper",
    ]);
    const local = await syncAchievementUnlocks(
      "user-1",
      ["momentum"],
      null,
      [],
    );

    expect(local?.pending).toEqual(["momentum"]);
    expect(isAchievementUnlockPending("user-1", "the-long-way")).toBe(false);
    expect(isAchievementUnlockPending("user-1", "city-hopper")).toBe(false);
    expect(loadAchievementUnlocks("user-1")?.earned).toEqual(["momentum"]);
  });

  it("replaces stale earned IDs even when the count is unchanged", async () => {
    reconcileAchievementUnlocks("user-1", ["the-long-way"]);

    await syncAchievementUnlocks(
      "user-1",
      ["momentum"],
      loadAchievementUnlocks("user-1"),
      [],
    );

    expect(loadAchievementUnlocks("user-1")?.earned).toEqual(["momentum"]);
  });

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

  it("migrates legacy state using the current achievements as a baseline", () => {
    values.set(
      "hecate:achievement-unlocks:v1:user-1",
      JSON.stringify({ earned: [], pending: [] }),
    );

    expect(reconcileAchievementUnlocks("user-1", ["mostly-uncharted"])).toEqual({
      newlyEarned: [],
      pending: [],
    });
    expect(
      reconcileAchievementUnlocks("user-1", ["mostly-uncharted"]),
    ).toEqual({ newlyEarned: [], pending: [] });
  });

  it("removes an unlock that is absent from the complete evaluation", () => {
    reconcileAchievementUnlocks("user-1", []);
    reconcileAchievementUnlocks("user-1", ["the-long-way"]);
    dismissAchievementUnlock("user-1", "the-long-way");

    expect(reconcileAchievementUnlocks("user-1", [])).toEqual({
      newlyEarned: [],
      pending: [],
    });
    expect(isAchievementUnlockPending("user-1", "the-long-way")).toBe(false);
    expect(reconcileAchievementUnlocks("user-1", ["the-long-way"])).toEqual({
      newlyEarned: ["the-long-way"],
      pending: ["the-long-way"],
    });
    expect(isAchievementUnlockPending("user-1", "the-long-way")).toBe(true);
  });

  it("removes an unconfirmed unlock from the complete evaluation", () => {
    reconcileAchievementUnlocks("user-1", []);
    reconcileAchievementUnlocks("user-1", ["momentum"]);

    expect(reconcileAchievementUnlocks("user-1", [])).toEqual({
      newlyEarned: [],
      pending: [],
    });
    expect(isAchievementUnlockPending("user-1", "momentum")).toBe(false);
  });
});
