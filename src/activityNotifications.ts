export type ActivityNotificationCategory =
  | "morningInvite"
  | "weeklyRecap"
  | "streakReminder";

export type ActivityNotificationPreferences = Record<
  ActivityNotificationCategory,
  boolean
>;

const STORAGE_VERSION = 1;

export function defaultActivityNotificationPreferences(): ActivityNotificationPreferences {
  return {
    morningInvite: false,
    weeklyRecap: false,
    streakReminder: false,
  };
}

export function enabledActivityNotificationPreferences(): ActivityNotificationPreferences {
  return {
    morningInvite: true,
    weeklyRecap: true,
    streakReminder: true,
  };
}

function storageKey(userId: string): string {
  return `hecate:activity-notifications:v${STORAGE_VERSION}:${userId}`;
}

function isActivityNotificationPreferences(
  value: unknown,
): value is ActivityNotificationPreferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Partial<ActivityNotificationPreferences>;
  return (
    typeof preferences.morningInvite === "boolean" &&
    typeof preferences.weeklyRecap === "boolean" &&
    typeof preferences.streakReminder === "boolean"
  );
}

export function loadActivityNotificationPreferences(
  userId: string,
): ActivityNotificationPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null");
    return isActivityNotificationPreferences(stored)
      ? stored
      : defaultActivityNotificationPreferences();
  } catch {
    return defaultActivityNotificationPreferences();
  }
}

export function hasSavedActivityNotificationPreferences(
  userId: string,
): boolean {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (stored === null) return false;
    const parsed: unknown = JSON.parse(stored);
    return isActivityNotificationPreferences(parsed);
  } catch {
    return false;
  }
}

export function saveActivityNotificationPreferences(
  userId: string,
  preferences: ActivityNotificationPreferences,
): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(preferences));
}

export function morningInviteMessage(discoveryDistanceKm: number): string {
  return `You have pioneered ${discoveryDistanceKm.toFixed(2)} km so far. Where to today?`;
}

export function weeklyRecapMessage(
  discoveryDistanceKm: number,
  travelledDistanceKm: number,
  streakDays: number,
): string {
  return `${discoveryDistanceKm.toFixed(1)} km of new ground, ${travelledDistanceKm.toFixed(1)} km travelled, and a ${streakDays}-day streak.`;
}

export function streakReminderMessage(streakDays: number): string {
  return `A short walk today keeps your ${streakDays}-day streak going.`;
}

export function streakReminderDate(
  now: number,
  travelledTodayKm: number,
): Date | null {
  const scheduled = new Date(now);
  if (travelledTodayKm > 0) {
    scheduled.setDate(scheduled.getDate() + 1);
  } else if (scheduled.getHours() >= 18) {
    return null;
  }
  scheduled.setHours(18, 0, 0, 0);
  return scheduled;
}

export function nextWeeklyRecapDate(now: number): Date {
  const date = new Date(now);
  date.setHours(18, 0, 0, 0);
  date.setDate(date.getDate() + (7 - date.getDay()) % 7);
  if (date.getTime() <= now) date.setDate(date.getDate() + 7);
  return date;
}
import { discoveryJourneyMetrics } from "./geo";
import { walkingStatsFromJourneys } from "./walkingStats";
import type { Coordinate } from "./types";


export function weeklyRecapFromPoints(points: Coordinate[], now: number): string {
  const journeys = discoveryJourneyMetrics(points);
  const week = new Date(now);
  week.setHours(0, 0, 0, 0);
  week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  const weekly = journeys.filter((journey) =>
    journey.finishedAt >= week.getTime() && journey.finishedAt <= now,
  );
  return weeklyRecapMessage(
    weekly.reduce((total, journey) => total + journey.newGroundKm, 0),
    weekly.reduce((total, journey) => total + journey.travelledKm, 0),
    walkingStatsFromJourneys(journeys, now).currentStreakDays,
  );
}
