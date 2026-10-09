import { evaluatePersonalAchievements } from "./achievements";
import { discoveredCityProgress, type CityBoundary } from "./city";
import { discoveredDistanceKm } from "./geo";
import type { Coordinate, DiscoveryCell } from "./types";

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
    const progressResponse: DiscoveryProgressResponse = {
      kind: "progress",
      generation,
      discoveryDistance: discoveredDistanceKm(points),
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
