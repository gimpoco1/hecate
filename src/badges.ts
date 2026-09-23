export type CityMilestoneTier = {
  id: "first-footprint" | "pathfinder" | "city-cartographer";
  title: string;
  image: string;
  thresholdKm: number;
  level: 1 | 2 | 3;
};

export type EarnedCityMilestone = CityMilestoneTier & {
  cityId: string;
  cityName: string;
};

export const CITY_MILESTONE_TIERS: readonly CityMilestoneTier[] = [
  {
    id: "first-footprint",
    title: "First Footprint",
    image: "/achievements/first-footprint.png",
    thresholdKm: 5,
    level: 1,
  },
  {
    id: "pathfinder",
    title: "Pathfinder",
    image: "/achievements/pathfinder.png",
    thresholdKm: 25,
    level: 2,
  },
  {
    id: "city-cartographer",
    title: "City Cartographer",
    image: "/achievements/city-cartographer.png",
    thresholdKm: 100,
    level: 3,
  },
];

export function earnedCityMilestones(
  cityId: string,
  cityName: string,
  discoveredKm: number,
): EarnedCityMilestone[] {
  return CITY_MILESTONE_TIERS
    .filter((tier) => discoveredKm >= tier.thresholdKm)
    .map((tier) => ({ ...tier, cityId, cityName }));
}

export function nextCityMilestone(discoveredKm: number) {
  return CITY_MILESTONE_TIERS.find((tier) => discoveredKm < tier.thresholdKm) ?? null;
}

export function cityMilestoneProgress(discoveredKm: number) {
  const next = nextCityMilestone(discoveredKm);
  if (!next) return { next: null, progress: 1 };
  const previous = [...CITY_MILESTONE_TIERS]
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
