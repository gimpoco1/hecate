import { Capacitor } from "@capacitor/core";
import type { JourneyMotion, JourneyStartMode } from "./journeyAutomation";
import type { LocationAuthorization, ReminderMotionAuthorization } from "./location";

const STORAGE_KEY = "hecate:journey-diagnostics:v1";
const MAX_ENTRIES = 240;

export type JourneyDiagnosticStatus = "settings" | "waiting-for-readiness" | "monitor-not-needed" | "starting-monitor" | "monitor-started" | "monitor-stopped" | "monitor-failed" | "waiting-for-motion" | "cooldown" | "collecting-gps" | "waiting-for-gps" | "waiting-for-walking-duration" | "starting-journey" | "journey-started" | "journey-active" | "pausing-journey" | "resuming-journey" | "stopping-journey" | "candidate-failed" | "motion-observed";

export type JourneyDiagnosticReadiness = {
  authReady: boolean;
  discoveryLoading: boolean;
  historyReady: boolean;
  walkFinalizing: boolean;
  saveFailed: boolean;
};

export type JourneyDiagnostic = {
  at: number;
  status: JourneyDiagnosticStatus;
  visible: boolean;
  ready: boolean;
  readiness: JourneyDiagnosticReadiness;
  signedIn: boolean;
  settingsReady: boolean;
  mode: JourneyStartMode;
  autoPause: boolean;
  startMinutes: number;
  pauseMinutes: number;
  stopMinutes: number;
  cooldownUntil: number;
  motion: JourneyMotion["activity"] | null;
  motionSince: number | null;
  motionObservedAt: number | null;
  locationAuthorization: LocationAuthorization | null;
  motionAuthorization: ReminderMotionAuthorization | null;
  motionAvailable: boolean | null;
  walkingMs: number;
  bufferedPoints: number;
  rawPoints: number;
  rejectedGpsPoints: number;
  lastRawPointAt: number | null;
  lastAcceptedPointAt: number | null;
  lastAccuracy: number | null;
  journeyActive: boolean;
  idleSince: number | null;
  pausedAt: number | null;
  failureCode: string | null;
};

function readEntries(storage: Storage): string[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const entries: string[] = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES || !entries.every(entry => typeof entry === "string" && entry.length < 12_000)) {
    throw new TypeError("Saved journey diagnostics are invalid.");
  }
  return entries;
}

/** Store bounded, coordinate-free observations independently of the recording journal. */
export function saveJourneyDiagnostic(storage: Storage, diagnostic: JourneyDiagnostic): void {
  const entries = [...readEntries(storage), JSON.stringify(diagnostic)].slice(-MAX_ENTRIES);
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function journeyDiagnosticReport(storage: Storage): string {
  return ["Hecate journey diagnostics v1", `Platform: ${Capacitor.getPlatform()}`, `Exported: ${new Date().toISOString()}`, ...readEntries(storage)].join("\n");
}
