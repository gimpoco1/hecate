import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Coordinate } from "./types";

export type JourneyStartMode = "manual" | "automatic";
export type JourneySource = "manual" | "automatic";
export type JourneyPreferences = { mode: JourneyStartMode; autoPause: boolean; startMinutes: number; restartMinutes: number; pauseMinutes: number; stopMinutes: number };
export type JourneyMotion = { activity: "walking" | "cycling" | "stationary" | "other" | "unknown"; since: number };
export type JourneySeed = { source: JourneySource; startedAt: number; pausedMs: number; points: Coordinate[] };
export const JOURNEY_START_DURATIONS: readonly number[] = [1, 2, 3, 5, 7, 10, 15];
export const JOURNEY_PAUSE_DURATIONS: readonly number[] = [1, 2, 3, 5, 10, 15];
export const JOURNEY_STOP_DURATIONS: readonly number[] = [5, 7, 10, 15, 20, 30, 60];
export const ONBOARDING_JOURNEY_MODE_KEY = "hecate:onboarding-journey-mode:v1";
export const JOURNEY_RESTART_DURATIONS: readonly number[] = [1, 2, 3, 5, 10, 15, 30, 60];

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
  return { mode: "manual", autoPause: true, startMinutes: 5, restartMinutes: 30, pauseMinutes: 2, stopMinutes: 7 };
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
  if (raw === null) return applyOnboardingJourneyPreferences(ownerId, defaultJourneyPreferences());
  const value: Omit<JourneyPreferences, "mode"> & { mode: JourneyStartMode | "assisted" } = JSON.parse(raw);
  if (!value || !["manual", "assisted", "automatic"].includes(value.mode)
    || typeof value.autoPause !== "boolean" || !JOURNEY_STOP_DURATIONS.includes(value.stopMinutes)
    || (value.restartMinutes !== undefined && !JOURNEY_RESTART_DURATIONS.includes(value.restartMinutes))
    || (value.startMinutes !== undefined && !JOURNEY_START_DURATIONS.includes(value.startMinutes))
    || (value.pauseMinutes !== undefined && !JOURNEY_PAUSE_DURATIONS.includes(value.pauseMinutes))) {
    throw new TypeError("Saved journey settings are invalid. Choose your journey settings again.");
  }
  const preferences: JourneyPreferences = { mode: value.mode === "assisted" ? "automatic" : value.mode, autoPause: value.autoPause, startMinutes: value.startMinutes ?? 5, restartMinutes: value.restartMinutes ?? 30, pauseMinutes: value.pauseMinutes ?? 2, stopMinutes: value.stopMinutes };
  return applyOnboardingJourneyPreferences(ownerId, preferences);
}

function applyOnboardingJourneyPreferences(ownerId: string, preferences: JourneyPreferences): JourneyPreferences {
  const onboardingMode = localStorage.getItem(ONBOARDING_JOURNEY_MODE_KEY);
  if (onboardingMode === null) return preferences;
  if (onboardingMode !== "manual" && onboardingMode !== "automatic") throw new TypeError("Invalid onboarding journey recording mode.");
  const chosen: JourneyPreferences = { ...preferences, mode: onboardingMode, autoPause: onboardingMode === "automatic", startMinutes: 5 };
  saveJourneyPreferences(ownerId, chosen);
  localStorage.removeItem(ONBOARDING_JOURNEY_MODE_KEY);
  return chosen;
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

export const CANDIDATE_STOP_GRACE_MS = 2 * 60_000;
export type CandidateWalkingClock = { walkingMs: number; walkingSince: number | null; interruptedAt: number | null };

/** Brief stationary or uncertain intervals preserve progress without counting as walking. */
export function advanceCandidateWalkingClock(clock: CandidateWalkingClock, motion: JourneyMotion): CandidateWalkingClock | null {
  if (motion.activity === "cycling" || motion.activity === "other") return null;
  if (motion.activity === "walking") {
    if (clock.walkingSince !== null) return clock;
    if (clock.interruptedAt === null) throw new Error("Interrupted candidate walking clock is missing its stop time.");
    if (motion.since - clock.interruptedAt > CANDIDATE_STOP_GRACE_MS) return null;
    return { walkingMs: clock.walkingMs, walkingSince: Math.max(motion.since, clock.interruptedAt), interruptedAt: null };
  }
  if (clock.walkingSince === null) return clock;
  const interruptedAt = Math.max(motion.since, clock.walkingSince);
  return { walkingMs: clock.walkingMs + interruptedAt - clock.walkingSince, walkingSince: null, interruptedAt };
}

export function candidateWalkingDuration(clock: CandidateWalkingClock, now: number): number {
  return clock.walkingMs + (clock.walkingSince === null ? 0 : Math.max(0, now - clock.walkingSince));
}
