import { evaluatePersonalAchievements } from "./achievements";
import { discoveredCityProgress, type CityBoundary } from "./city";
import { discoveryJourneyMetrics } from "./geo";
import type { Coordinate, DiscoveryCell } from "./types";
import { walkingStatsFromJourneys, type WalkingStats } from "./walkingStats";

export type DiscoveryMetricsRequest = {
  generation: number;
  points: Coordinate[];
  cells: DiscoveryCell[];
  cities: CityBoundary[];
  achievementCityIds: string[];
};

export type DiscoveryProgressResponse = {
  kind: "progress";
  generation: number;
  discoveryDistance: number;
  travelledDistance: number;
  walkingStats: WalkingStats;
  todayDiscoveryDistance: number;
  todayTravelledDistance: number;
  todayActiveTimeMs: number;
  weekDiscoveryDistance: number;
  weekActiveTimeMs: number;
  weekDiscoveryDeltaDistance: number;
  weekActiveDeltaTimeMs: number;
  cityMetrics: Array<{
    cityId: string;
    percentage: number;
    distance: number;
  }>;
};

function startOfLocalDay(timestamp: number) {
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function startOfLocalWeek(timestamp: number) {
  const day = new Date(timestamp);
  const dayIndex = (day.getDay() + 6) % 7;
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - dayIndex);
  return day.getTime();
}

export type DiscoveryAchievementsResponse = {
  kind: "achievements";
  generation: number;
  achievementEvaluations: ReturnType<typeof evaluatePersonalAchievements>;
};

export type DiscoveryMetricsResponse =
  | DiscoveryProgressResponse
  | DiscoveryAchievementsResponse;

self.addEventListener(
  "message",
  (event: MessageEvent<DiscoveryMetricsRequest>): void => {
    const { generation, points, cells, cities, achievementCityIds } = event.data;
    const cityMetrics = cities.map((city) => ({
      cityId: city.id,
      ...discoveredCityProgress(points, cells, city),
    }));
    const achievementCityIdSet = new Set(achievementCityIds);
    const achievementCities = cities.filter((city) =>
      achievementCityIdSet.has(city.id),
    );
    const journeys = discoveryJourneyMetrics(points);
    const now = Date.now();
    const todayStart = startOfLocalDay(now);
    const weekStart = startOfLocalWeek(now);
    const thisWeekJourneys = journeys.filter(
      (journey) => journey.finishedAt >= weekStart,
    );
    const previousWeekStart = weekStart - 7 * 24 * 60 * 60 * 1_000;
    const previousWeekJourneys = journeys.filter(
      (journey) =>
        journey.finishedAt >= previousWeekStart && journey.finishedAt < weekStart,
    );
    const todayJourneys = thisWeekJourneys.filter(
      (journey) => journey.finishedAt >= todayStart,
    );
    const weekDiscoveryDistance = thisWeekJourneys.reduce(
      (total, journey) => total + journey.newGroundKm,
      0,
    );
    const previousWeekDiscoveryDistance = previousWeekJourneys.reduce(
      (total, journey) => total + journey.newGroundKm,
      0,
    );
    const weekActiveTimeMs = thisWeekJourneys.reduce(
      (total, journey) =>
        total + Math.max(0, journey.finishedAt - journey.startedAt),
      0,
    );
    const previousWeekActiveTimeMs = previousWeekJourneys.reduce(
      (total, journey) =>
        total + Math.max(0, journey.finishedAt - journey.startedAt),
      0,
    );
    const progressResponse: DiscoveryProgressResponse = {
      kind: "progress",
      generation,
      discoveryDistance: journeys.reduce(
        (total, journey) => total + journey.newGroundKm,
        0,
      ),
      travelledDistance: journeys.reduce(
        (total, journey) => total + journey.travelledKm,
        0,
      ),
      walkingStats: walkingStatsFromJourneys(journeys, now),
      todayDiscoveryDistance: todayJourneys.reduce(
        (total, journey) => total + journey.newGroundKm,
        0,
      ),
      todayTravelledDistance: todayJourneys.reduce(
        (total, journey) => total + journey.travelledKm,
        0,
      ),
      todayActiveTimeMs: todayJourneys.reduce(
        (total, journey) =>
          total + Math.max(0, journey.finishedAt - journey.startedAt),
        0,
      ),
      weekDiscoveryDistance,
      weekActiveTimeMs,
      weekDiscoveryDeltaDistance:
        weekDiscoveryDistance - previousWeekDiscoveryDistance,
      weekActiveDeltaTimeMs: weekActiveTimeMs - previousWeekActiveTimeMs,
      cityMetrics,
    };
    self.postMessage(progressResponse);

    const achievementsResponse: DiscoveryAchievementsResponse = {
      kind: "achievements",
      generation,
      achievementEvaluations: evaluatePersonalAchievements(
        points,
        achievementCities,
      ),
    };
    self.postMessage(achievementsResponse);
  },
);
