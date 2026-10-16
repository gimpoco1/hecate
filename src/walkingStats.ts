import type { DiscoveryJourneyMetric } from "./geo";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type WalkingStats = {
  walkCount: number;
  longestWalkKm: number;
  longestWalkFinishedAt: number | null;
  averageWalkKm: number;
  currentStreakDays: number;
  bestStreakDays: number;
  firstWalkAt: number | null;
};

export function emptyWalkingStats(): WalkingStats {
  return {
    walkCount: 0,
    longestWalkKm: 0,
    longestWalkFinishedAt: null,
    averageWalkKm: 0,
    currentStreakDays: 0,
    bestStreakDays: 0,
    firstWalkAt: null,
  };
}

function localDayOrdinal(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function consecutiveRunEndingAt(days: number[], finalDay: number): number {
  const availableDays = new Set(days);
  let length = 0;
  for (let day = finalDay; availableDays.has(day); day -= 1) length += 1;
  return length;
}

function longestConsecutiveRun(days: number[]): number {
  const uniqueDays = [...new Set(days)].sort((first, second) => first - second);
  let best = 0;
  let current = 0;
  let previous: number | null = null;
  uniqueDays.forEach((day) => {
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = day;
  });
  return best;
}

export function walkingStatsFromJourneys(
  journeys: DiscoveryJourneyMetric[],
  now: number,
): WalkingStats {
  if (journeys.length === 0) return emptyWalkingStats();

  const longestWalk = journeys.reduce((longest, journey) =>
    journey.travelledKm > longest.travelledKm ? journey : longest,
  );
  const totalDistance = journeys.reduce(
    (total, journey) => total + journey.travelledKm,
    0,
  );
  const walkingDays = journeys.map(({ finishedAt }) =>
    localDayOrdinal(finishedAt),
  );
  const lastWalkingDay = Math.max(...walkingDays);
  const today = localDayOrdinal(now);
  const currentStreakDays = lastWalkingDay >= today - 1
    ? consecutiveRunEndingAt(walkingDays, lastWalkingDay)
    : 0;

  return {
    walkCount: journeys.length,
    longestWalkKm: longestWalk.travelledKm,
    longestWalkFinishedAt: longestWalk.finishedAt,
    averageWalkKm: totalDistance / journeys.length,
    currentStreakDays,
    bestStreakDays: longestConsecutiveRun(walkingDays),
    firstWalkAt: Math.min(...journeys.map(({ startedAt }) => startedAt)),
  };
}
