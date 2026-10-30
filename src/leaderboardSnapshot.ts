import { evaluatePersonalAchievementsInTimeZone, type PersonalAchievementId } from "./achievements.ts";
import { discoveredCityDistanceKm, discoveredCityPercentage, type CityBoundary } from "./city.ts";
import { discoveredDistanceKm } from "./geo.ts";
import type { Coordinate, DiscoveryCell } from "./types.ts";

export const LEADERBOARD_CALCULATION_VERSION = 3;
export type LeaderboardCity = { cityId: string; cityName: string; discoveredKm: number; discoveredPercentage: number };
export type LeaderboardSnapshot = { calculationVersion: number; totalDiscoveredKm: number; cities: LeaderboardCity[]; achievements: PersonalAchievementId[] };

export function leaderboardSnapshotFromDiscovery(
  points: Coordinate[],
  cells: DiscoveryCell[],
  cities: CityBoundary[],
  timeZone: string,
): LeaderboardSnapshot {
  const citySnapshots = cities
    .map(city => ({
      cityId: city.id,
      cityName: city.name,
      // Match the native city drawer exactly. Cells determine revealed area and
      // percentage, but their ordered centers are only an approximate route and
      // must never be used as a kilometre counter.
      discoveredKm: discoveredCityDistanceKm(points, city),
      discoveredPercentage: discoveredCityPercentage(cells, city),
    }))
    .sort((a, b) => b.discoveredPercentage - a.discoveredPercentage);

  return {
    calculationVersion: LEADERBOARD_CALCULATION_VERSION,
    // Overall discovery is global new ground. City rows are clipped to their
    // boundaries, so Barcelona can correctly show 17.9 km while the account's
    // complete discovery total remains 18.3 km.
    totalDiscoveredKm: discoveredDistanceKm(points),
    cities: citySnapshots,
    achievements: evaluatePersonalAchievementsInTimeZone(points, cities, timeZone).filter(value => value.earned).map(value => value.definition.id),
  };
}

export function leaderboardSnapshotForCities(
  snapshot: LeaderboardSnapshot,
  selectedCityIds: Iterable<string>,
): LeaderboardSnapshot {
  const selected = new Set(selectedCityIds);
  const cities = snapshot.cities.filter(city => selected.has(city.cityId));
  return {
    ...snapshot,
    // A user who omits a city must not leak that city's distance through the
    // aggregate total. The shared total is therefore limited to selected rows.
    totalDiscoveredKm: cities.reduce((total, city) => total + city.discoveredKm, 0),
    cities,
  };
}

export function refreshedPublishedSnapshot<T extends { cities: LeaderboardCity[] }>(
  snapshot: LeaderboardSnapshot,
  publishedEntry: T,
): LeaderboardSnapshot {
  return {
    ...leaderboardSnapshotForCities(
      snapshot,
      publishedEntry.cities.map(city => city.cityId),
    ),
    // Joining the leaderboard shares every earned achievement. City selection
    // remains explicit because those aggregates carry location context.
    achievements: snapshot.achievements,
  };
}

