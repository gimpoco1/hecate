import { isPointInCity, type CityBoundary } from "./city";
import {
  discoveryJourneyMetricsByRegion,
  distanceKm,
  type DiscoveryJourneyMetric,
} from "./geo";
import type { Coordinate } from "./types";

/**
 * Canonical public achievement ID allow-list.
 *
 * The leaderboard RPC validates these IDs independently in `supabase.sql` and
 * `scripts/install-leaderboard-achievements.sql`. The pretest/prebuild parity
 * check fails whenever either deployed SQL definition drifts from this tuple.
 */
export const PERSONAL_ACHIEVEMENT_IDS = [
  "the-long-way",
  "mostly-uncharted",
  "full-circle",
  "three-day-spark",
  "momentum",
  "local-ritual",
  "city-hopper",
  "against-the-familiar",
] as const;

export type PersonalAchievementId = (typeof PERSONAL_ACHIEVEMENT_IDS)[number];

export type PersonalAchievementDefinition = {
  id: PersonalAchievementId;
  title: string;
  description: string;
  image: string;
  category: "single-walk" | "consistency" | "places";
};

export const PERSONAL_ACHIEVEMENTS: readonly PersonalAchievementDefinition[] = [
  {
    id: "the-long-way",
    title: "The Long Way",
    description: "Add 8 km of new places to your map during one walk.",
    image: "/achievements/the-long-way.png",
    category: "single-walk",
  },
  {
    id: "mostly-uncharted",
    title: "Mostly Uncharted",
    description:
      "Walk 5 km in one go, with at least 80% in places that are new to your map.",
    image: "/achievements/mostly-uncharted.png",
    category: "single-walk",
  },
  {
    id: "full-circle",
    title: "Full Circle",
    description:
      "In one walk, travel 5 km, add 2 km to your map, and finish within 200 m of your start.",
    image: "/achievements/full-circle.png",
    category: "single-walk",
  },
  {
    id: "three-day-spark",
    title: "Three-Day Spark",
    description: "Add at least 500 m to your map each day for 3 days in a row.",
    image: "/achievements/three-day-spark.png",
    category: "consistency",
  },
  {
    id: "momentum",
    title: "Momentum",
    description: "Add at least 500 m to your map on 7 different days within 2 weeks.",
    image: "/achievements/momentum.png",
    category: "consistency",
  },
  {
    id: "local-ritual",
    title: "Local Ritual",
    description:
      "In the same city, add at least 500 m to your map on 10 different days.",
    image: "/achievements/local-ritual.png",
    category: "places",
  },
  {
    id: "city-hopper",
    title: "City Hopper",
    description: "Add at least 2 km to your map in each of 5 different cities.",
    image: "/achievements/city-hopper.png",
    category: "places",
  },
  {
    id: "against-the-familiar",
    title: "Against the Familiar",
    description:
      "In one 8 km walk, add 3 km to your map while at least half the route follows places already on your map.",
    image: "/achievements/against-the-familiar.png",
    category: "single-walk",
  },
];

const ACHIEVEMENT_IDS = new Set(PERSONAL_ACHIEVEMENTS.map(({ id }) => id));
const DAY_MS = 24 * 60 * 60 * 1_000;
const QUALIFYING_DAY_KM = 0.5;

export type AchievementEvaluation = {
  definition: PersonalAchievementDefinition;
  earned: boolean;
  progress: number;
  progressLabel: string;
};

export type AchievementCityDistance = {
  cityId: string;
  discoveredKm: number;
};

type JourneyWithCityDistances = DiscoveryJourneyMetric & {
  newGroundKmByRegion: Record<string, number>;
};

export function isPersonalAchievementId(
  value: unknown,
): value is PersonalAchievementId {
  return typeof value === "string" && ACHIEVEMENT_IDS.has(value as PersonalAchievementId);
}

export function personalAchievementDefinition(id: PersonalAchievementId) {
  return PERSONAL_ACHIEVEMENTS.find((achievement) => achievement.id === id)!;
}

function localDayOrdinal(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function longestConsecutiveRun(days: number[]) {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous: number | null = null;
  for (const day of unique) {
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

function mostDaysWithinWindow(days: number[], windowDays: number) {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  let best = 0;
  let left = 0;
  for (let right = 0; right < unique.length; right += 1) {
    while (unique[right] - unique[left] >= windowDays) left += 1;
    best = Math.max(best, right - left + 1);
  }
  return best;
}

export function evaluateAchievementsFromJourneys(
  journeys: JourneyWithCityDistances[],
  cityDistances: AchievementCityDistance[],
): AchievementEvaluation[] {
  const longestNewWalk = Math.max(0, ...journeys.map(({ newGroundKm }) => newGroundKm));
  const bestUncharted = journeys.reduce(
    (best, journey) => {
      const ratio = journey.travelledKm > 0
        ? Math.min(1, journey.newGroundKm / journey.travelledKm)
        : 0;
      const progress = Math.min(journey.travelledKm / 5, ratio / 0.8);
      return progress > best.progress ? { journey, ratio, progress } : best;
    },
    { journey: null as JourneyWithCityDistances | null, ratio: 0, progress: 0 },
  );
  const fullCircle = journeys.reduce(
    (best, journey) => {
      const first = journey.points[0];
      const last = journey.points.at(-1);
      const closes = first && last ? distanceKm(first, last) <= 0.2 : false;
      const completed = Number(journey.travelledKm >= 5)
        + Number(journey.newGroundKm >= 2)
        + Number(closes);
      return completed > best ? completed : best;
    },
    0,
  );
  const dailyDistance = new Map<number, number>();
  journeys.forEach((journey) => {
    const day = localDayOrdinal(journey.finishedAt);
    dailyDistance.set(day, (dailyDistance.get(day) ?? 0) + journey.newGroundKm);
  });
  const qualifyingDays = [...dailyDistance]
    .filter(([, distance]) => distance >= QUALIFYING_DAY_KM)
    .map(([day]) => day);
  const consecutiveDays = longestConsecutiveRun(qualifyingDays);
  const momentumDays = mostDaysWithinWindow(qualifyingDays, 14);

  const cityDailyDistance = new Map<string, Map<number, number>>();
  journeys.forEach((journey) => {
    const day = localDayOrdinal(journey.finishedAt);
    Object.entries(journey.newGroundKmByRegion).forEach(([cityId, distance]) => {
      const dailyDistance = cityDailyDistance.get(cityId) ?? new Map<number, number>();
      dailyDistance.set(day, (dailyDistance.get(day) ?? 0) + distance);
      cityDailyDistance.set(cityId, dailyDistance);
    });
  });
  const localRitualDays = Math.max(
    0,
    ...[...cityDailyDistance.values()].map(
      (days) => [...days.values()].filter((distance) => distance >= QUALIFYING_DAY_KM).length,
    ),
  );
  const qualifyingCities = cityDistances.filter(({ discoveredKm }) => discoveredKm >= 2).length;
  const againstFamiliar = journeys.reduce(
    (best, journey) => {
      const newRatio = journey.travelledKm > 0
        ? Math.min(1, journey.newGroundKm / journey.travelledKm)
        : 0;
      const familiarRatio = 1 - newRatio;
      const progress = Math.min(
        journey.travelledKm / 8,
        journey.newGroundKm / 3,
        familiarRatio / 0.5,
      );
      return progress > best.progress
        ? { journey, familiarRatio, progress }
        : best;
    },
    {
      journey: null as JourneyWithCityDistances | null,
      familiarRatio: 0,
      progress: 0,
    },
  );

  const states: Record<PersonalAchievementId, Omit<AchievementEvaluation, "definition">> = {
    "the-long-way": {
      earned: longestNewWalk >= 8,
      progress: Math.min(1, longestNewWalk / 8),
      progressLabel: `${Math.min(longestNewWalk, 8).toFixed(1)} of 8 km added in one walk`,
    },
    "mostly-uncharted": {
      earned: Boolean(
        bestUncharted.journey
          && bestUncharted.journey.travelledKm >= 5
          && bestUncharted.ratio >= 0.8,
      ),
      progress: Math.min(1, bestUncharted.progress),
      progressLabel: bestUncharted.journey
        ? `${Math.round(bestUncharted.ratio * 100)}% new on a ${bestUncharted.journey.travelledKm.toFixed(1)} km walk`
        : "No completed walks yet",
    },
    "full-circle": {
      earned: fullCircle === 3,
      progress: fullCircle / 3,
      progressLabel: `${fullCircle} of 3 walk goals complete`,
    },
    "three-day-spark": {
      earned: consecutiveDays >= 3,
      progress: Math.min(1, consecutiveDays / 3),
      progressLabel: `${Math.min(consecutiveDays, 3)} of 3 days in a row`,
    },
    momentum: {
      earned: momentumDays >= 7,
      progress: Math.min(1, momentumDays / 7),
      progressLabel: `${Math.min(momentumDays, 7)} of 7 days within 2 weeks`,
    },
    "local-ritual": {
      earned: localRitualDays >= 10,
      progress: Math.min(1, localRitualDays / 10),
      progressLabel: `${Math.min(localRitualDays, 10)} of 10 days in one city`,
    },
    "city-hopper": {
      earned: qualifyingCities >= 5,
      progress: Math.min(1, qualifyingCities / 5),
      progressLabel: `${Math.min(qualifyingCities, 5)} of 5 cities at 2 km`,
    },
    "against-the-familiar": {
      earned: Boolean(
        againstFamiliar.journey
          && againstFamiliar.journey.travelledKm >= 8
          && againstFamiliar.journey.newGroundKm >= 3
          && againstFamiliar.familiarRatio >= 0.5,
      ),
      progress: Math.min(1, againstFamiliar.progress),
      progressLabel: againstFamiliar.journey
        ? `${againstFamiliar.journey.newGroundKm.toFixed(1)} km new · ${Math.round(againstFamiliar.familiarRatio * 100)}% familiar`
        : "No completed walks yet",
    },
  };

  return PERSONAL_ACHIEVEMENTS.map((definition) => ({
    definition,
    ...states[definition.id],
  }));
}

export function evaluatePersonalAchievements(
  points: Coordinate[],
  cities: CityBoundary[],
  cityDistances: AchievementCityDistance[],
) {
  const journeys = discoveryJourneyMetricsByRegion(
    points,
    (point) => cities.find((city) => isPointInCity(point, city))?.id ?? null,
  ).map((journey): JourneyWithCityDistances => ({
    ...journey,
    newGroundKmByRegion: journey.newGroundKmByRegion ?? {},
  }));
  return evaluateAchievementsFromJourneys(journeys, cityDistances);
}

export function earnedPersonalAchievementIds(
  points: Coordinate[],
  cities: CityBoundary[],
  cityDistances: AchievementCityDistance[],
) {
  return evaluatePersonalAchievements(points, cities, cityDistances)
    .filter(({ earned }) => earned)
    .map(({ definition }) => definition.id);
}
