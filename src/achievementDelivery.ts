import { earnedPersonalAchievementIds } from "./achievements";
import { reconcileAchievementUnlocks } from "./achievementUnlocks";
import type { CityBoundary } from "./city";
import type { Coordinate } from "./types";

/**
 * Evaluates and persists unlocks without depending on React state. Native
 * background-location callbacks use this path while the map UI is suspended.
 */
export function reconcileDiscoveryAchievementUnlocks(
  userId: string,
  points: Coordinate[],
  cities: CityBoundary[],
) {
  const earned = earnedPersonalAchievementIds(points, cities);
  return reconcileAchievementUnlocks(userId, earned);
}
