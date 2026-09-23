import { isPointInCity, type CityBoundary } from "./city";
import {
  discoveryJourneyMetrics,
  distanceKm,
  type DiscoveryJourneyMetric,
} from "./geo";
import type { Coordinate } from "./types";

export type PersonalAchievementId =
  | "the-long-way"
  | "mostly-uncharted"
  | "full-circle"
  | "three-day-spark"
  | "momentum"
  | "local-ritual"
  | "city-hopper"
  | "against-the-familiar";

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
    description: "Uncover 4 km of new ground in a single walk.",
    image: "/achievements/the-long-way.png",
    category: "single-walk",
  },
  {
    id: "mostly-uncharted",
    title: "Mostly Uncharted",
    description:
      "Complete a 2 km walk where at least 75% of the route reveals new ground.",
    image: "/achievements/mostly-uncharted.png",
    category: "single-walk",
  },
  {
    id: "full-circle",
    title: "Full Circle",
    description:
      "Walk 2 km, uncover 1 km, and finish within 150 m of where you started.",
    image: "/achievements/full-circle.png",
    category: "single-walk",
  },
  {
    id: "three-day-spark",
    title: "Three-Day Spark",
    description: "Uncover at least 250 m on three consecutive days.",
    image: "/achievements/three-day-spark.png",
    category: "consistency",
  },
  {
    id: "momentum",
    title: "Momentum",
    description: "Uncover at least 250 m on five days within one week.",
    image: "/achievements/momentum.png",
    category: "consistency",
  },
  {
    id: "local-ritual",
    title: "Local Ritual",
    description:
      "Make a qualifying discovery in the same city on five different days.",
    image: "/achievements/local-ritual.png",
    category: "places",
  },
  {
    id: "city-hopper",
    title: "City Hopper",
    description: "Uncover at least 500 m in three different cities.",
    image: "/achievements/city-hopper.png",
    category: "places",
  },
  {
    id: "against-the-familiar",
    title: "Against the Familiar",
    description:
      "Uncover 1 km on a 2 km walk where at least 40% of the route was already familiar.",
    image: "/achievements/against-the-familiar.png",
    category: "single-walk",
  },
];

const ACHIEVEMENT_IDS = new Set(PERSONAL_ACHIEVEMENTS.map(({ id }) => id));
const DAY_MS = 24 * 60 * 60 * 1_000;
const QUALIFYING_DAY_KM = 0.25;

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

type JourneyWithCity = DiscoveryJourneyMetric & { cityId: string | null };

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

function journeyCity(
  journey: DiscoveryJourneyMetric,
  cities: CityBoundary[],
) {
  let best: CityBoundary | null = null;
  let bestCount = 0;
  for (const city of cities) {
    const count = journey.points.filter((point) => isPointInCity(point, city)).length;
    if (count > bestCount) {
      best = city;
      bestCount = count;
    }
  }
  return best?.id ?? null;
}

export function evaluateAchievementsFromJourneys(
  journeys: JourneyWithCity[],
  cityDistances: AchievementCityDistance[],
): AchievementEvaluation[] {
  const longestNewWalk = Math.max(0, ...journeys.map(({ newGroundKm }) => newGroundKm));
  const bestUncharted = journeys.reduce(
    (best, journey) => {
      const ratio = journey.travelledKm > 0
        ? Math.min(1, journey.newGroundKm / journey.travelledKm)
        : 0;
      const progress = Math.min(journey.travelledKm / 2, ratio / 0.75);
      return progress > best.progress ? { journey, ratio, progress } : best;
    },
    { journey: null as JourneyWithCity | null, ratio: 0, progress: 0 },
  );
  const fullCircle = journeys.reduce(
    (best, journey) => {
      const first = journey.points[0];
      const last = journey.points.at(-1);
      const closes = first && last ? distanceKm(first, last) <= 0.15 : false;
      const completed = Number(journey.travelledKm >= 2)
        + Number(journey.newGroundKm >= 1)
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
  const momentumDays = mostDaysWithinWindow(qualifyingDays, 7);

  const cityDays = new Map<string, Set<number>>();
  journeys
    .filter((journey) => journey.cityId && journey.newGroundKm >= QUALIFYING_DAY_KM)
    .forEach((journey) => {
      const days = cityDays.get(journey.cityId!) ?? new Set<number>();
      days.add(localDayOrdinal(journey.finishedAt));
      cityDays.set(journey.cityId!, days);
    });
  const localRitualDays = Math.max(0, ...[...cityDays.values()].map((days) => days.size));
  const qualifyingCities = cityDistances.filter(({ discoveredKm }) => discoveredKm >= 0.5).length;
  const againstFamiliar = journeys.reduce(
    (best, journey) => {
      const newRatio = journey.travelledKm > 0
        ? Math.min(1, journey.newGroundKm / journey.travelledKm)
        : 0;
      const familiarRatio = 1 - newRatio;
      const progress = Math.min(
        journey.travelledKm / 2,
        journey.newGroundKm / 1,
        familiarRatio / 0.4,
      );
      return progress > best.progress
        ? { journey, familiarRatio, progress }
        : best;
    },
    {
      journey: null as JourneyWithCity | null,
      familiarRatio: 0,
      progress: 0,
    },
  );

  const states: Record<PersonalAchievementId, Omit<AchievementEvaluation, "definition">> = {
    "the-long-way": {
      earned: longestNewWalk >= 4,
      progress: Math.min(1, longestNewWalk / 4),
      progressLabel: `${Math.min(longestNewWalk, 4).toFixed(1)} / 4 km in one walk`,
    },
    "mostly-uncharted": {
      earned: Boolean(
        bestUncharted.journey
          && bestUncharted.journey.travelledKm >= 2
          && bestUncharted.ratio >= 0.75,
      ),
      progress: Math.min(1, bestUncharted.progress),
      progressLabel: bestUncharted.journey
        ? `${Math.round(bestUncharted.ratio * 100)}% new on a ${bestUncharted.journey.travelledKm.toFixed(1)} km walk`
        : "No completed walks yet",
    },
    "full-circle": {
      earned: fullCircle === 3,
      progress: fullCircle / 3,
      progressLabel: `${fullCircle} / 3 route conditions met`,
    },
    "three-day-spark": {
      earned: consecutiveDays >= 3,
      progress: Math.min(1, consecutiveDays / 3),
      progressLabel: `${Math.min(consecutiveDays, 3)} / 3 consecutive days`,
    },
    momentum: {
      earned: momentumDays >= 5,
      progress: Math.min(1, momentumDays / 5),
      progressLabel: `${Math.min(momentumDays, 5)} / 5 days in one week`,
    },
    "local-ritual": {
      earned: localRitualDays >= 5,
      progress: Math.min(1, localRitualDays / 5),
      progressLabel: `${Math.min(localRitualDays, 5)} / 5 days in one city`,
    },
    "city-hopper": {
      earned: qualifyingCities >= 3,
      progress: Math.min(1, qualifyingCities / 3),
      progressLabel: `${Math.min(qualifyingCities, 3)} / 3 cities`,
    },
    "against-the-familiar": {
      earned: Boolean(
        againstFamiliar.journey
          && againstFamiliar.journey.travelledKm >= 2
          && againstFamiliar.journey.newGroundKm >= 1
          && againstFamiliar.familiarRatio >= 0.4,
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
  const journeys: JourneyWithCity[] = discoveryJourneyMetrics(points).map(
    (journey) => ({ ...journey, cityId: journeyCity(journey, cities) }),
  );
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
