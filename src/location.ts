import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
} from "@capacitor-community/background-geolocation";
import type { Coordinate } from "./types";

export interface LocationTrackerError {
  code: "permission-denied" | "unavailable";
  message: string;
}

export interface LocationTracker {
  start(
    onPoint: (point: Coordinate) => void,
    onError: (error: LocationTrackerError) => void,
  ): Promise<void>;
  stop(): void | Promise<void>;
}

export type PassiveLocationMode = "foreground" | "reminder" | null;

/** Foreground positioning takes priority; reminder monitoring is background-only. */
export function passiveLocationMode(
  appVisible: boolean,
  remindersEnabled: boolean,
): PassiveLocationMode {
  if (appVisible) return "foreground";
  return remindersEnabled ? "reminder" : null;
}

/** Pick the freshest available fix when centering the map on the user. */
export function newestCoordinate(
  ...points: Array<Coordinate | null | undefined>
) {
  return points.reduce<Coordinate | undefined>((newest, point) => {
    if (!point) return newest;
    return !newest || point.recordedAt > newest.recordedAt ? point : newest;
  }, undefined);
}

class WebLocationTracker implements LocationTracker {
  private watchId: number | null = null;
  private active = false;

  constructor(private readonly recordingWalk: boolean) {}

  async start(
    onPoint: (point: Coordinate) => void,
    onError: (error: LocationTrackerError) => void,
  ) {
    if (!navigator.geolocation) throw new Error("Geolocation is unavailable");
    this.active = true;
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (!this.active) return;
        onPoint({
          lng: coords.longitude,
          lat: coords.latitude,
          recordedAt: timestamp,
          accuracy: coords.accuracy,
          heading: coords.heading === null ? undefined : coords.heading,
        });
      },
      (error) => {
        if (!this.active) return;
        onError({
          code:
            error.code === error.PERMISSION_DENIED
              ? "permission-denied"
              : "unavailable",
          message: error.message,
        });
      },
      {
        enableHighAccuracy: this.recordingWalk,
        maximumAge: this.recordingWalk ? 3_000 : 15_000,
        timeout: 15_000,
      },
    );
  }

  stop() {
    this.active = false;
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

interface HecateBackgroundGeolocationPlugin extends BackgroundGeolocationPlugin {
  removeAllWatchers(): Promise<void>;
  getAuthorizationStatus(): Promise<{ status: string }>;
}

export type LocationAuthorization = "always" | "whenInUse" | "denied" | "notDetermined";

export async function readLocationAuthorization(): Promise<LocationAuthorization> {
  const { status } = await HecateBackgroundGeolocation.getAuthorizationStatus();
  if (status !== "always" && status !== "whenInUse" &&
      status !== "denied" && status !== "notDetermined")
    throw new Error("Unrecognized location authorization status: " + status);
  return status;
}

const HecateBackgroundGeolocation =
  BackgroundGeolocation as HecateBackgroundGeolocationPlugin;
let nativeRuntimePreparation: Promise<void> | null = null;

async function retryNativeOperation(
  operation: () => Promise<void>,
  operationName: string,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      console.warn("Native location operation failed; retrying", {
        operation: operationName,
        attempt,
        error,
      });
      await Promise.resolve();
    }
  }
  throw lastError;
}

async function prepareNativeRuntime() {
  if (Capacitor.getPlatform() !== "ios") return;
  if (!nativeRuntimePreparation) {
    nativeRuntimePreparation = retryNativeOperation(
      () => HecateBackgroundGeolocation.removeAllWatchers(),
      "removeAllWatchers",
    ).catch((error) => {
      nativeRuntimePreparation = null;
      throw error;
    });
  }
  await nativeRuntimePreparation;
}

async function removeNativeWatcher(id: string) {
  await retryNativeOperation(
    () => BackgroundGeolocation.removeWatcher({ id }),
    "removeWatcher",
  );
}

function nativeError(error: CallbackError | unknown): LocationTrackerError {
  const candidate =
    error && typeof error === "object"
      ? (error as Partial<CallbackError>)
      : null;
  return {
    code:
      candidate?.code === "NOT_AUTHORIZED"
        ? "permission-denied"
        : "unavailable",
    message: candidate?.message || "Location is unavailable.",
  };
}

class NativeLocationTracker implements LocationTracker {
  private watcherId: string | null = null;
  private stopRequested = false;
  private removalPromise: Promise<void> | null = null;
  private active = false;

  constructor(private readonly mode: "walk" | "foreground" | "reminder", private readonly journeyId: string | null) {}

  async start(
    onPoint: (point: Coordinate) => void,
    onError: (error: LocationTrackerError) => void,
  ) {
    this.stopRequested = false;
    this.active = true;
    await prepareNativeRuntime();
    if (this.stopRequested) return;
    const options: Parameters<BackgroundGeolocationPlugin["addWatcher"]>[0] & {
      showsBackgroundLocationIndicator?: boolean;
      journeyId: string | null;
    } = {
      showsBackgroundLocationIndicator: this.mode === "walk",
      journeyId: this.journeyId,
      ...(this.mode === "walk"
        ? {
            backgroundTitle: "Hecate is revealing your path",
            backgroundMessage:
              "Your discovery is continuing in the background.",
          }
        : this.mode === "reminder"
          ? {
              backgroundTitle: "Hecate is checking for walks",
              backgroundMessage:
                "Discovery reminders are on. No path is being recorded.",
            }
          : {}),
      requestPermissions: true,
      // A recent cached fix makes the locate control useful immediately while
      // iOS obtains a fresh foreground position. Walks and reminders continue
      // to require fresh locations.
      stale: this.mode === "foreground",
      distanceFilter:
        this.mode === "walk" ? 8 : this.mode === "reminder" ? 30 : 20,
    };
    const watcherId = await BackgroundGeolocation.addWatcher(
      options,
      (location, error) => {
        if (!this.active) return;
        if (error) {
          onError(nativeError(error));
          return;
        }
        if (!location) return;
        onPoint({
          lng: location.longitude,
          lat: location.latitude,
          recordedAt: location.time ?? Date.now(),
          accuracy: location.accuracy,
          heading: location.bearing ?? undefined,
        });
      },
    );
    if (this.stopRequested) {
      this.removalPromise = removeNativeWatcher(watcherId);
      await this.removalPromise;
      this.removalPromise = null;
      return;
    }
    this.watcherId = watcherId;
  }

  async stop() {
    this.stopRequested = true;
    // Native watcher removal is asynchronous. Ignore callbacks immediately so
    // a final queued fix cannot leak into a completed or newly started walk.
    this.active = false;
    if (!this.watcherId) {
      await this.removalPromise;
      return;
    }
    const id = this.watcherId;
    this.watcherId = null;
    this.removalPromise = removeNativeWatcher(id);
    try {
      await this.removalPromise;
    } finally {
      this.removalPromise = null;
    }
  }
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function createLocationTracker(walkId: string): LocationTracker {
  return isNativeApp()
    ? new NativeLocationTracker("walk", walkId)
    : new WebLocationTracker(true);
}

export function createForegroundLocationTracker(): LocationTracker {
  return isNativeApp()
    ? new NativeLocationTracker("foreground", null)
    : new WebLocationTracker(false);
}

export function createReminderLocationTracker(): LocationTracker {
  return isNativeApp()
    ? new NativeLocationTracker("reminder", null)
    : new WebLocationTracker(false);
}

export async function openLocationSettings() {
  if (!isNativeApp()) return;
  await BackgroundGeolocation.openSettings();
}
