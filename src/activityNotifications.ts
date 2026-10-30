import { formatNumber, t } from "./i18n";
import { cityMilestoneProgress, nextWorldMilestone, worldMilestoneProgress } from "./badges";
import { DISCOVERY_REMINDER_DURATIONS, INACTIVITY_REMINDER_DURATIONS } from "./reminderDurations";

export type ActivityNotificationCategory =
  | "morningInvite"
  | "weeklyRecap"
  | "streakReminder";

export type ActivityNotificationPreferences = Record<
  ActivityNotificationCategory,
  boolean
> & { streakReminderTime: string; dailyReminderTime: string; discoveryReminderMinutes: number; inactivityReminderMinutes: number; discoveredAreaReminders: boolean };

const STORAGE_VERSION = 1;

export function defaultActivityNotificationPreferences(): ActivityNotificationPreferences {
  return {
    morningInvite: false,
    weeklyRecap: false,
    streakReminder: false,
    streakReminderTime: "18:00",
    dailyReminderTime: "10:00",
    discoveryReminderMinutes: 5,
    inactivityReminderMinutes: 15,
    discoveredAreaReminders: false,
  };
}

export function enabledActivityNotificationPreferences(): ActivityNotificationPreferences {
  return {
    morningInvite: true,
    weeklyRecap: true,
    streakReminder: true,
    streakReminderTime: "18:00",
    dailyReminderTime: "10:00",
    discoveryReminderMinutes: 5,
    inactivityReminderMinutes: 15,
    discoveredAreaReminders: false,
  };
}

export function isReminderTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function storageKey(userId: string): string {
  return `hecate:activity-notifications:v${STORAGE_VERSION}:${userId}`;
}

function isActivityNotificationPreferences(
  value: unknown,
): value is Record<ActivityNotificationCategory, boolean> & {
  streakReminderTime?: string;
  dailyReminderTime?: string;
  discoveryReminderMinutes?: number;
  inactivityReminderMinutes?: number;
  discoveredAreaReminders?: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Partial<ActivityNotificationPreferences>;
  return (
    typeof preferences.morningInvite === "boolean" &&
    typeof preferences.weeklyRecap === "boolean" &&
    typeof preferences.streakReminder === "boolean" &&
    (preferences.streakReminderTime === undefined ||
      (typeof preferences.streakReminderTime === "string" &&
        isReminderTime(preferences.streakReminderTime))) &&
    (preferences.dailyReminderTime === undefined ||
      (typeof preferences.dailyReminderTime === "string" &&
        isReminderTime(preferences.dailyReminderTime))) &&
    (preferences.discoveryReminderMinutes === undefined ||
      DISCOVERY_REMINDER_DURATIONS.includes(preferences.discoveryReminderMinutes)) &&
    (preferences.inactivityReminderMinutes === undefined ||
      INACTIVITY_REMINDER_DURATIONS.includes(preferences.inactivityReminderMinutes)) &&
    (preferences.discoveredAreaReminders === undefined ||
      typeof preferences.discoveredAreaReminders === "boolean")
  );
}

export function loadActivityNotificationPreferences(
  userId: string,
): ActivityNotificationPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null");
    return isActivityNotificationPreferences(stored)
      ? {
        ...stored,
        streakReminderTime: stored.streakReminderTime ?? "18:00",
        dailyReminderTime: stored.dailyReminderTime ?? "10:00",
        discoveryReminderMinutes: stored.discoveryReminderMinutes ?? 5,
        inactivityReminderMinutes: stored.inactivityReminderMinutes ?? 15,
        discoveredAreaReminders: stored.discoveredAreaReminders ?? false,
      }
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

type CityReminderProgress = {
  cityName: string;
  discoveredKm: number;
};

type NearbyMilestone = {
  remainingKm: number;
  progress: number;
  title: string;
  cityName: string | null;
};

export function morningInviteMessage(
  travelledDistanceKm: number | null,
  city: CityReminderProgress | null,
): string {
  const candidates: NearbyMilestone[] = [];
  if (travelledDistanceKm !== null) {
    const next = nextWorldMilestone(travelledDistanceKm);
    if (next) candidates.push({
      remainingKm: next.thresholdKm - travelledDistanceKm,
      progress: worldMilestoneProgress(travelledDistanceKm),
      title: next.title,
      cityName: null,
    });
  }
  if (city) {
    const milestone = cityMilestoneProgress(city.discoveredKm);
    if (milestone.next) candidates.push({
      remainingKm: milestone.next.thresholdKm - city.discoveredKm,
      progress: milestone.progress,
      title: milestone.next.title,
      cityName: city.cityName,
    });
  }
  const closest = candidates
    .filter(({ remainingKm, progress }) => remainingKm > 0 && remainingKm <= 1 && progress >= 0.9)
    .sort((a, b) => a.remainingKm - b.remainingKm)[0];
  if (closest) {
    const meters = Math.ceil(closest.remainingKm * 1_000);
    const distance = meters >= 1_000 ? "1 km" : `${meters} m`;
    return closest.cityName === null
      ? t("notification.globalMilestoneNear", { distance, milestone: closest.title })
      : t("notification.cityMilestoneNear", { distance, milestone: closest.title, city: closest.cityName });
  }
  return t("A new day, a new path. Where will you discover today?");
}

export function weeklyRecapMessage(
  discoveryDistanceKm: number,
  travelledDistanceKm: number,
  streakDays: number,
): string {
  return t("{{value0}} km of new ground, {{value1}} km travelled, and a {{value2}}-day streak.", { value0: formatNumber(discoveryDistanceKm, 1), value1: formatNumber(travelledDistanceKm, 1), value2: streakDays });
}

export function streakReminderMessage(streakDays: number): string {
  return t("A short walk today keeps your {{value0}}-day streak going.", { value0: streakDays });
}

export function streakReminderDate(
  now: number,
  travelledTodayKm: number,
  reminderTime: string,
): Date | null {
  if (!isReminderTime(reminderTime)) {
    throw new RangeError(t("Invalid streak reminder time: {{value0}}. Expected HH:mm.", { value0: reminderTime }));
  }
  const [hour, minute] = reminderTime.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hour, minute, 0, 0);
  if (travelledTodayKm > 0) {
    scheduled.setDate(scheduled.getDate() + 1);
  } else if (scheduled.getTime() <= now) {
    return null;
  }
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
