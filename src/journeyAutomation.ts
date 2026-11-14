import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Coordinate } from "./types";

export type JourneyStartMode = "manual" | "automatic";
export type JourneySource = "manual" | "automatic";
export type JourneyPreferences = { mode: JourneyStartMode; autoPause: boolean; startMinutes: number; pauseMinutes: number; stopMinutes: number };
export type JourneyMotion = { activity: "walking" | "cycling" | "stationary" | "other" | "unknown"; since: number };
export type JourneySeed = { source: JourneySource; startedAt: number; points: Coordinate[] };
export const JOURNEY_START_DURATIONS: readonly number[] = [1, 2, 3, 5, 7, 10, 15];
export const JOURNEY_PAUSE_DURATIONS: readonly number[] = [1, 2, 3, 5, 10, 15];
export const JOURNEY_STOP_DURATIONS: readonly number[] = [5, 7, 10, 15, 20, 30, 60];
export const AUTO_RESTART_COOLDOWN_MS = 30 * 60_000;

interface JourneyMotionPlugin {
  getAvailability(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<{ motion: JourneyMotion | null }>;
  addListener(event: "monitorError", callback: (error: { code: number; message: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "motion", callback: (motion: JourneyMotion) => void): Promise<PluginListenerHandle>;
}
export const JourneyMotionMonitor = registerPlugin<JourneyMotionPlugin>("JourneyMotion");

export function defaultJourneyPreferences(): JourneyPreferences {
  return { mode: "manual", autoPause: true, startMinutes: 5, pauseMinutes: 2, stopMinutes: 7 };
}

export function parseJourneyMotion(value: JourneyMotion): JourneyMotion {
  if (!value || !["walking", "cycling", "stationary", "other", "unknown"].includes(value.activity)
    || !Number.isFinite(value.since) || value.since <= 0 || value.since > Date.now() + 10_000) {
    throw new TypeError("Native journey motion has an invalid activity or timestamp.");
  }
  return { activity: value.activity, since: value.since };
}

export function loadJourneyPreferences(ownerId: string): JourneyPreferences {
  const raw = localStorage.getItem(`hecate:journey-preferences:v1:${ownerId}`);
  if (raw === null) return defaultJourneyPreferences();
  const value: Omit<JourneyPreferences, "mode"> & { mode: JourneyStartMode | "assisted" } = JSON.parse(raw);
  if (!value || !["manual", "assisted", "automatic"].includes(value.mode)
    || typeof value.autoPause !== "boolean" || !JOURNEY_STOP_DURATIONS.includes(value.stopMinutes)
    || (value.startMinutes !== undefined && !JOURNEY_START_DURATIONS.includes(value.startMinutes))
    || (value.pauseMinutes !== undefined && !JOURNEY_PAUSE_DURATIONS.includes(value.pauseMinutes))) {
    throw new TypeError("Saved journey settings are invalid. Choose your journey settings again.");
  }
  return { mode: value.mode === "assisted" ? "automatic" : value.mode, autoPause: value.autoPause, startMinutes: value.startMinutes ?? 5, pauseMinutes: value.pauseMinutes ?? 2, stopMinutes: value.stopMinutes };
}

export function saveJourneyPreferences(ownerId: string, preferences: JourneyPreferences): void {
  localStorage.setItem(`hecate:journey-preferences:v1:${ownerId}`, JSON.stringify(preferences));
}

export function isJourneyMovement(motion: JourneyMotion): boolean {
  return motion.activity === "walking" || motion.activity === "cycling";
}

/** Reconcile inactivity using movement onset, even if iOS delivered that movement after suspension. */
export function inactivityDeadlineBeforeMovement(idleSince: number | null, motion: JourneyMotion, delayMinutes: number): number | null {
  if (idleSince === null || !isJourneyMovement(motion)) return null;
  return motion.since - idleSince >= delayMinutes * 60_000 ? idleSince : null;
}
