import type { DiscoveryJourneyRoute } from "./geo";
import { cityPointPredicate, type CityBoundary } from "./city";
import type { Coordinate } from "./types";

export type JourneyHistoryEntry = DiscoveryJourneyRoute & { cityNames: string[] };

export type JourneyHistoryFilters = { weekStart: number; selectedDay: number | null };

/** Start weeks on Monday in the user's local timezone. */
export function journeyWeekStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date.getTime();
}

/** Calendar-day arithmetic preserves local midnight across daylight-saving changes. */
export function shiftJourneyDay(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** Match recorded locations against saved boundaries, preferring canonical regions. */
function journeyCityMatcher(cities: CityBoundary[]): (points: Coordinate[]) => string[] {
  const boundaries = [...cities].sort((first, second) => Number(second.id.startsWith("region:")) - Number(first.id.startsWith("region:")))
    .map(city => ({ name: city.name, contains: cityPointPredicate(city) }));
  return points => [...new Set(points.flatMap(point => {
    const city = boundaries.find(boundary => boundary.contains(point));
    return city ? [city.name] : [];
  }))];
}

export function journeyCityNames(points: Coordinate[], cities: CityBoundary[]): string[] {
  return journeyCityMatcher(cities)(points);
}

/** Prepare history in the metrics worker, compiling city boundaries once per update. */
export function journeyHistoryEntries(journeys: DiscoveryJourneyRoute[], cities: CityBoundary[]): JourneyHistoryEntry[] {
  const cityNames = journeyCityMatcher(cities);
  return journeys.map(journey => ({ ...journey, cityNames: cityNames(journey.points) }));
}

/** Serialize a calendar date without converting local midnight to UTC. */
export function journeyDateValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Validate native date-input values before navigating the local journey calendar. */
export function parseJourneyDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid journey date: ${value}. Expected YYYY-MM-DD.`);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (journeyDateValue(date.getTime()) !== value) throw new RangeError(`Invalid journey calendar date: ${value}.`);
  return date.getTime();
}
