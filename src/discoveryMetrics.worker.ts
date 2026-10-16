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
  cityMetrics: Array<{
    cityId: string;
    percentage: number;
    distance: number;
  }>;
};

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
      walkingStats: walkingStatsFromJourneys(journeys, Date.now()),
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
