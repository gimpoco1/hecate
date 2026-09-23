export type CityBadgeTier = {
  id: "first-footprint" | "pathfinder" | "city-cartographer";
  title: string;
  image: string;
  thresholdKm: number;
  level: 1 | 2 | 3;
};

export type EarnedCityBadge = CityBadgeTier & {
  cityId: string;
  cityName: string;
};

export const CITY_BADGE_TIERS: readonly CityBadgeTier[] = [
  {
    id: "first-footprint",
    title: "First Footprint",
    image: "/achievements/first-footprint.png",
    thresholdKm: 1,
    level: 1,
  },
  {
    id: "pathfinder",
    title: "Pathfinder",
    image: "/achievements/pathfinder.png",
    thresholdKm: 5,
    level: 2,
  },
  {
    id: "city-cartographer",
    title: "City Cartographer",
    image: "/achievements/city-cartographer.png",
    thresholdKm: 20,
    level: 3,
  },
];

export function earnedCityBadges(
  cityId: string,
  cityName: string,
  discoveredKm: number,
): EarnedCityBadge[] {
  return CITY_BADGE_TIERS
    .filter((tier) => discoveredKm >= tier.thresholdKm)
    .map((tier) => ({ ...tier, cityId, cityName }));
}

export function nextCityBadge(discoveredKm: number) {
  return CITY_BADGE_TIERS.find((tier) => discoveredKm < tier.thresholdKm) ?? null;
}

export function cityBadgeProgress(discoveredKm: number) {
  const next = nextCityBadge(discoveredKm);
  if (!next) return { next: null, progress: 1 };
  const previous = [...CITY_BADGE_TIERS]
    .reverse()
    .find((tier) => tier.thresholdKm <= discoveredKm);
  const start = previous?.thresholdKm ?? 0;
  return {
    next,
    progress: Math.max(
      0,
      Math.min(1, (discoveredKm - start) / (next.thresholdKm - start)),
    ),
  };
}
