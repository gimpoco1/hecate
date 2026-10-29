import { t } from "./i18n";
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

export type WorldMilestoneTier = {
  id:
    | "first-step"
    | "wayfinder"
    | "neighbourhood-pioneer"
    | "marathon"
    | "edge-of-space"
    | "space-station"
    | "across-the-moon"
    | "through-the-earth"
    | "around-the-world"
    | "to-the-moon";
  title: string;
  thresholdKm: number;
  icon:
    | "step"
    | "map"
    | "home"
    | "run"
    | "plane"
    | "signal"
    | "moon"
    | "earth-depth"
    | "globe"
    | "moon-stars";
};

export const CITY_MILESTONE_TIERS: readonly CityMilestoneTier[] = [
  {
    id: "first-footprint",
    get title() { return t("First Footprint"); },
    image: "/achievements/first-footprint.png",
    thresholdKm: 5,
    level: 1,
  },
  {
    id: "pathfinder",
    get title() { return t("Pathfinder"); },
    image: "/achievements/pathfinder.png",
    thresholdKm: 25,
    level: 2,
  },
  {
    id: "city-cartographer",
    get title() { return t("City Cartographer"); },
    image: "/achievements/city-cartographer.png",
    thresholdKm: 100,
    level: 3,
  },
];

export const WORLD_MILESTONE_TIERS: readonly WorldMilestoneTier[] = [
  { id: "first-step", get title() { return t("First Step"); }, thresholdKm: 0, icon: "step" },
  { id: "wayfinder", get title() { return t("Wayfinder"); }, thresholdKm: 5, icon: "map" },
  {
    id: "neighbourhood-pioneer",
    get title() { return t("Neighbourhood Pioneer"); },
    thresholdKm: 15,
    icon: "home",
  },
  { id: "marathon", get title() { return t("Marathon"); }, thresholdKm: 42.2, icon: "run" },
  {
    id: "edge-of-space",
    get title() { return t("Edge of Space"); },
    thresholdKm: 100,
    icon: "plane",
  },
  {
    id: "space-station",
    get title() { return t("Space Station"); },
    thresholdKm: 408,
    icon: "signal",
  },
  {
    id: "across-the-moon",
    get title() { return t("Across the Moon"); },
    thresholdKm: 3_476,
    icon: "moon",
  },
  {
    id: "through-the-earth",
    get title() { return t("Through the Earth"); },
    thresholdKm: 12_742,
    icon: "earth-depth",
  },
  {
    id: "around-the-world",
    get title() { return t("Around the World"); },
    thresholdKm: 40_075,
    icon: "globe",
  },
  {
    id: "to-the-moon",
    get title() { return t("To the Moon"); },
    thresholdKm: 384_400,
    icon: "moon-stars",
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

export function currentWorldMilestone(travelledKm: number): WorldMilestoneTier {
  return [...WORLD_MILESTONE_TIERS]
    .reverse()
    .find((tier) => travelledKm >= tier.thresholdKm)!;
}

export function nextWorldMilestone(travelledKm: number): WorldMilestoneTier | null {
  return (
    WORLD_MILESTONE_TIERS.find((tier) => travelledKm < tier.thresholdKm) ?? null
  );
}

export function worldMilestoneProgress(travelledKm: number): number {
  const current = currentWorldMilestone(travelledKm);
  const next = nextWorldMilestone(travelledKm);
  if (!next) return 1;
  return Math.max(
    0,
    Math.min(
      1,
      (travelledKm - current.thresholdKm) /
        (next.thresholdKm - current.thresholdKm),
    ),
  );
}
