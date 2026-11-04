import type { PersonalAchievementId } from "./achievements";

export type MapReward = "standard" | "paper" | "midnight" | "woodland" | "tidal" | "ember" | "parchment" | "aurora" | "frontier";
export type RewardState = { selected: MapReward; unlocked: MapReward[]; viewed?: MapReward[] };
export const MAP_REWARDS = [
  { id: "paper", goal: "three-day-spark", title: "Ink & Paper" },
  { id: "parchment", goal: "full-circle", title: "Parchment Atlas" },
  { id: "midnight", goal: "momentum", title: "Midnight Atlas" },
  { id: "woodland", goal: "local-ritual", title: "Woodland Atlas" },
  { id: "tidal", goal: "city-hopper", title: "Tidal Atlas" },
  { id: "ember", goal: "the-long-way", title: "Ember Atlas" },
  { id: "aurora", goal: "against-the-familiar", title: "Aurora Atlas" },
  { id: "frontier", goal: "mostly-uncharted", title: "Frontier Atlas" },
] as const satisfies readonly { id: MapReward; goal: PersonalAchievementId; title: string }[];

export function unlockMapRewards(state: RewardState, earned: readonly PersonalAchievementId[]): RewardState {
  return { ...state, unlocked: [...new Set([...state.unlocked, ...MAP_REWARDS.filter(reward => earned.includes(reward.goal)).map(reward => reward.id)])] };
}

export function loadMapRewards(userId: string): RewardState {
  const raw: string | null = localStorage.getItem(`hecate:map-rewards:v1:${userId}`);
  if (raw === null) return { selected: "standard", unlocked: ["standard"] };
  const state: RewardState = JSON.parse(raw);
  const valid = (value: string): boolean => (value === "standard" || MAP_REWARDS.some(reward => reward.id === value));
  if (!state || !valid(state.selected) || !Array.isArray(state.unlocked) || !state.unlocked.every(valid) || !state.unlocked.includes(state.selected) || (state.viewed !== undefined && (!Array.isArray(state.viewed) || !state.viewed.every(valid)))) {
    throw new TypeError("Invalid saved map rewards for account: " + userId);
  }
  return state;
}

export function saveMapRewards(userId: string, state: RewardState): void {
  if (!state.unlocked.includes(state.selected)) throw new Error("Complete the goal before applying this map appearance.");
  localStorage.setItem(`hecate:map-rewards:v1:${userId}`, JSON.stringify(state));
}
