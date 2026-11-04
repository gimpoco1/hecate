import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMapRewards, saveMapRewards, unlockMapRewards, type RewardState } from "./goalRewards";

describe("map reward progression", () => {
  it("unlocks the matching goals without selecting a reward or modifying inputs", () => {
    const initial: RewardState = { selected: "standard", unlocked: ["standard"] };
    const result = unlockMapRewards(initial, ["momentum", "three-day-spark"]);
    expect(result).toEqual({ selected: "standard", unlocked: ["standard", "paper", "midnight"] });
    expect(initial).toEqual({ selected: "standard", unlocked: ["standard"] });
  });
  it("retains earned appearances and selection after the qualifying window passes", () => {
    const initial: RewardState = { selected: "midnight", unlocked: ["standard", "midnight"] };
    expect(unlockMapRewards(initial, [])).toEqual(initial);
    expect(unlockMapRewards(initial, ["momentum"]).unlocked).toEqual(initial.unlocked);
  });
  it("keeps appearances locked until a goal is earned", () => {
    expect(unlockMapRewards({ selected: "standard", unlocked: ["standard"] }, []).unlocked).toEqual(["standard"]);
  });
});

it("awards the new appearances for their matching achievements and preserves an existing selection", () => {
  const state: RewardState = { selected: "midnight", unlocked: ["standard", "midnight"] };
  expect(unlockMapRewards(state, ["local-ritual", "city-hopper", "the-long-way"])).toEqual({
    selected: "midnight", unlocked: ["standard", "midnight", "woodland", "tidal", "ember"],
  });
});

it("preserves the former paper palette as a Full Circle reward", () => {
  expect(unlockMapRewards({ selected: "paper", unlocked: ["standard", "paper"] }, ["full-circle"])).toEqual({ selected: "paper", unlocked: ["standard", "paper", "parchment"] });
});

it("preserves viewed rewards while newly earned appearances remain unseen", () => {
  const initial: RewardState = { selected: "paper", unlocked: ["standard", "paper"], viewed: ["paper"] };
  const result = unlockMapRewards(initial, ["three-day-spark", "momentum"]);
  expect(result.viewed).toEqual(["paper"]);
  expect(result.unlocked).toContain("midnight");
  expect(result.viewed).not.toContain("midnight");
  expect(initial.unlocked).toEqual(["standard", "paper"]);
});

it("unlocks Aurora and Frontier for their exploration challenges without applying them", () => {
  const state: RewardState = { selected: "standard", unlocked: ["standard"] };
  expect(unlockMapRewards(state, ["against-the-familiar", "mostly-uncharted"])).toEqual({ selected: "standard", unlocked: ["standard", "aurora", "frontier"] });
});

describe("saved map rewards", () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["{bad json", "null", "[]", "42", '\"invalid\"'])("keeps the standard map available for corrupt storage: %s", raw => {
    localStorage.setItem("hecate:map-rewards:v1:account", raw);
    expect(loadMapRewards("account")).toEqual({ selected: "standard", unlocked: ["standard"] });
  });

  it("restores standard alongside valid rewards and permits selecting it", () => {
    localStorage.setItem("hecate:map-rewards:v1:account", JSON.stringify({ selected: "midnight", unlocked: ["midnight"] }));
    const loaded = loadMapRewards("account");
    expect(loaded.selected).toBe("midnight");
    expect(loaded.unlocked).toEqual(["standard", "midnight"]);
    saveMapRewards("account", { ...loaded, selected: "standard" });
    expect(loadMapRewards("account").selected).toBe("standard");
  });

  it("preserves valid progress while discarding invalid and duplicate entries", () => {
    localStorage.setItem("hecate:map-rewards:v1:account", JSON.stringify({ selected: "paper", unlocked: ["paper", "removed-style", null, "paper"], viewed: ["paper", "paper", "removed-style", "midnight"] }));
    expect(loadMapRewards("account")).toEqual({ selected: "paper", unlocked: ["standard", "paper"], viewed: ["paper"] });
    expect(loadMapRewards("other-account")).toEqual({ selected: "standard", unlocked: ["standard"] });
  });

  it.each([
    { selected: "removed-style", unlocked: ["paper"] },
    { selected: "midnight", unlocked: ["paper"] },
    { selected: "paper", unlocked: "paper", viewed: {} },
    {},
  ])("resets an invalid or locked selection to standard: %j", state => {
    localStorage.setItem("hecate:map-rewards:v1:account", JSON.stringify(state));
    expect(loadMapRewards("account").selected).toBe("standard");
    expect(loadMapRewards("account").unlocked).toContain("standard");
  });
});
