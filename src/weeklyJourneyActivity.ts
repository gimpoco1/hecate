import type { DiscoveryJourneyMetric } from "./geo";
import { journeyWeekStart, shiftJourneyDay } from "./journeyHistory";

export type JourneyActivityTotals = {
  discoveryRatio: number | null;
  journeyCount: number;
  travelledKm: number;
  newGroundKm: number;
  durationMs: number;
};

export type WeeklyJourneyActivity = JourneyActivityTotals & {
  activeDays: number;
  days: { startedAt: number; journeyCount: number; travelledKm: number; newGroundKm: number }[];
};

/** Aggregate the supplied journeys so day and week summaries use identical metrics. */
export function journeyActivityTotals(journeys: DiscoveryJourneyMetric[]): JourneyActivityTotals {
  const travelledKm = journeys.reduce((total, journey) => total + journey.travelledKm, 0);
  const newGroundKm = journeys.reduce((total, journey) => total + journey.newGroundKm, 0);
  return {
    journeyCount: journeys.length, travelledKm, newGroundKm,
    durationMs: journeys.reduce((total, journey) => total + Math.max(0, journey.finishedAt - journey.startedAt), 0),
    discoveryRatio: travelledKm > 0 ? Math.min(1, newGroundKm / travelledKm) : null,
  };
}

/** Use local Monday–Sunday dates and the same finish-date attribution as the drawer totals. */
export function weeklyJourneyActivity(journeys: DiscoveryJourneyMetric[], now: number): WeeklyJourneyActivity {
  const weekStart = journeyWeekStart(now);
  const weekEnd = shiftJourneyDay(weekStart, 7);
  const week = journeys.filter(journey => journey.finishedAt >= weekStart && journey.finishedAt < weekEnd);
  const days = Array.from({ length: 7 }, (_, index) => {
    const startedAt = shiftJourneyDay(weekStart, index);
    const finishedAt = shiftJourneyDay(startedAt, 1);
    const dayJourneys = week.filter(journey => journey.travelledKm > 0 && journey.finishedAt >= startedAt && journey.finishedAt < finishedAt);
    return { startedAt, journeyCount: dayJourneys.length, travelledKm: dayJourneys.reduce((total, journey) => total + journey.travelledKm, 0), newGroundKm: dayJourneys.reduce((total, journey) => total + journey.newGroundKm, 0) };
  });
  return {
    ...journeyActivityTotals(week),
    activeDays: days.filter(day => day.journeyCount > 0).length,
    days,
  };
}
