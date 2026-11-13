import { t } from "./i18n";
import { errorDiagnostic } from "./diagnostics";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
} from "@capacitor-community/background-geolocation";
import type { Coordinate } from "./types";

export interface LocationTrackerError {
  code: "permission-denied" | "unavailable" | "journey-stopped" | "speed-exceeded";
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
    if (!navigator.geolocation) throw new Error(t("Geolocation is unavailable"));
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
          speed: coords.speed === null ? undefined : coords.speed,
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
  requestMotionPermission(): Promise<{ granted: boolean }>;
  getMotionAuthorizationStatus(): Promise<{ status: string }>;
}

export function reminderMotionPermissionLabel(): string {
  return Capacitor.getPlatform() === "android" ? t("Physical activity") : t("Motion & Fitness");
}

export type ReminderMotionAuthorization = "authorized" | "denied" | "restricted" | "notDetermined" | "unavailable";

/** Reads platform activity-recognition access without displaying a permission prompt. */
export async function readReminderMotionAuthorization(): Promise<ReminderMotionAuthorization> {
  if (!Capacitor.isNativePlatform()) return "authorized";
  const { status } = await HecateBackgroundGeolocation.getMotionAuthorizationStatus();
  if (status !== "authorized" && status !== "denied" && status !== "restricted" && status !== "notDetermined" && status !== "unavailable")
    throw new Error(t("Unrecognized Motion & Fitness authorization status: ") + status);
  return status;
}

/** Native background reminders require the platform motion permission. */
export async function requestReminderMotionPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  const result = await HecateBackgroundGeolocation.requestMotionPermission();
  if (typeof result.granted !== "boolean") throw new Error(t("Native Motion & Fitness permission response is missing a boolean granted value."));
  return result.granted;
}

export type LocationAuthorization = "always" | "whenInUse" | "denied" | "notDetermined";

export async function readLocationAuthorization(): Promise<LocationAuthorization> {
  const { status } = await HecateBackgroundGeolocation.getAuthorizationStatus();
  if (status !== "always" && status !== "whenInUse" &&
      status !== "denied" && status !== "notDetermined")
    throw new Error(t("Unrecognized location authorization status: ") + status);
  return status;
}

const HecateBackgroundGeolocation =
  BackgroundGeolocation as HecateBackgroundGeolocationPlugin;
let nativeRuntimePreparation: Promise<void> | null = null;
let nativeWatcherCleanup: Promise<void> = Promise.resolve();

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
      console.warn("Native location operation failed; retrying", { operation: operationName, attempt, error: errorDiagnostic(error) });
      await Promise.resolve();
    }
  }
  throw lastError;
}

async function prepareNativeRuntime() {
  if (!Capacitor.isNativePlatform()) return;
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
      candidate?.code === "AIRPLANE_MODE"
        ? "journey-stopped"
        : candidate?.code === "MOTION_NOT_AUTHORIZED" || candidate?.code === "MOTION_UNAVAILABLE"
          ? "permission-denied"
          : candidate?.code === "NOT_AUTHORIZED"
            ? "permission-denied"
            : "unavailable",
    message: candidate?.message || t("Location is unavailable."),
  };
}

class NativeLocationTracker implements LocationTracker {
  private watcherId: string | null = null;
  private stopRequested = false;
  private active = false;
  private registrationPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(private readonly mode: "walk" | "foreground" | "reminder" | "candidate" | "automatic" | "automatic-monitor", private readonly journeyId: string | null) {}

  async start(
    onPoint: (point: Coordinate) => void,
    onError: (error: LocationTrackerError) => void,
  ) {
    this.stopRequested = false;
    this.stopPromise = null;
    this.active = true;
    const cleanup = nativeWatcherCleanup;
    this.registrationPromise = this.registerWatcher(onPoint, onError, cleanup);
    await this.registrationPromise;
  }

  private async registerWatcher(
    onPoint: (point: Coordinate) => void,
    onError: (error: LocationTrackerError) => void,
    cleanup: Promise<void>,
  ): Promise<void> {
    await cleanup;
    if (this.stopRequested) return;
    await prepareNativeRuntime();
    if (this.stopRequested) return;
    const options: Parameters<BackgroundGeolocationPlugin["addWatcher"]>[0] & {
      showsBackgroundLocationIndicator?: boolean;
      journeyId: string | null;
      motionGated: boolean;
    } = {
      showsBackgroundLocationIndicator: this.mode === "walk" || this.mode === "candidate" || this.mode === "automatic",
      journeyId: this.journeyId,
      motionGated: this.mode === "reminder" || this.mode === "automatic-monitor",
      ...(this.mode === "walk" || this.mode === "automatic"
        ? {
          backgroundTitle: t("Hecate is revealing your path"),
          backgroundMessage:
              t("Your discovery is continuing in the background."),
        }
        : this.mode === "candidate" || this.mode === "automatic-monitor"
          ? {
            backgroundTitle: t("Hecate is detecting a journey"),
            backgroundMessage: t("Your route is buffered until five minutes of walking qualify."),
          }
          : this.mode === "reminder"
            ? {
              backgroundTitle: t("Hecate is checking for walks"),
              backgroundMessage:
                t("Discovery reminders are on. No path is being recorded."),
            }
            : {}),
      requestPermissions: true,
      // A recent cached fix makes the locate control useful immediately while
      // iOS obtains a fresh foreground position. Walks and reminders continue
      // to require fresh locations.
      stale: this.mode === "foreground",
      distanceFilter:
        this.mode === "automatic" ? 0 : this.mode === "walk" || this.mode === "candidate" ? 8 : this.mode === "reminder" ? 30 : 20,
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
          speed: location.speed ?? undefined,
        });
      },
    );
    if (this.stopRequested) {
      await removeNativeWatcher(watcherId);
      return;
    }
    this.watcherId = watcherId;
  }

  async stop() {
    this.stopRequested = true;
    // Native watcher removal is asynchronous. Ignore callbacks immediately so
    // a final queued fix cannot leak into a completed or newly started walk.
    this.active = false;
    if (this.stopPromise) return this.stopPromise;
    const registration = this.registrationPromise;
    this.stopPromise = nativeWatcherCleanup.then(async () => {
      try {
        await registration;
      } catch (cause) {
        console.warn("Removing native location state after failed registration", { mode: this.mode, journeyId: this.journeyId, cause: errorDiagnostic(cause) });
        await retryNativeOperation(() => HecateBackgroundGeolocation.removeAllWatchers(), "removeAllWatchers");
      }
      if (!this.watcherId) return;
      const id = this.watcherId;
      await removeNativeWatcher(id);
      this.watcherId = null;
    });
    nativeWatcherCleanup = this.stopPromise;
    return this.stopPromise;
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

/** Buffers precise fixes without assigning them to a saved journey. */
export function createCandidateLocationTracker(): LocationTracker {
  if (!isNativeApp()) throw new Error("Automatic journeys require the iOS or Android app.");
  return new NativeLocationTracker("candidate", null);
}

/** Stationary fixes keep the automatic-end deadline observable while the phone is locked. */
export function createAutomaticJourneyTracker(walkId: string): LocationTracker {
  if (!isNativeApp()) throw new Error("Automatic journeys require the iOS or Android app.");
  return new NativeLocationTracker("automatic", walkId);
}

/** Keeps the native motion-gated wake service available between automatic journeys. */
export function createAutomaticMonitoringTracker(): LocationTracker {
  if (!isNativeApp()) throw new Error("Automatic journeys require the iOS or Android app.");
  return new NativeLocationTracker("automatic-monitor", null);
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

/** A missing permission-query capability means unknown; explicit geolocation still works. */
async function readWebLocationPermission(): Promise<PermissionStatus | null> {
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") return null;
  try {
    return await navigator.permissions.query({ name: "geolocation" });
  } catch (cause) {
    if (!(cause instanceof TypeError) && !(cause instanceof DOMException && cause.name === "NotSupportedError")) throw cause;
    console.warn("Browser cannot query geolocation permission", { error: errorDiagnostic(cause) });
    return null;
  }
}

/** Reads enabled, blocked, or unknown/requestable access without opening a system prompt. */
export async function readForegroundLocationPermission(): Promise<boolean | null> {
  if (isNativeApp()) {
    const status = await readLocationAuthorization();
    if (status === "notDetermined") return null;
    return status === "always" || status === "whenInUse";
  }
  const permission = await readWebLocationPermission();
  if (!permission || permission.state === "prompt") return null;
  return permission.state === "granted";
}

/** Passive positioning starts only when access is known to be granted. */
export async function hasForegroundLocationPermission(): Promise<boolean> {
  return await readForegroundLocationPermission() === true;
}

export async function hasBackgroundLocationPermission(): Promise<boolean> {
  return isNativeApp() ? await readLocationAuthorization() === "always" : hasForegroundLocationPermission();
}

/** Requests foreground access after a user gesture, then releases its temporary watcher. */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  const native = isNativeApp();
  if (native) {
    const status = await readLocationAuthorization();
    if (status !== "notDetermined") return status === "always" || status === "whenInUse";
  }
  const webPermission = native ? null : await readWebLocationPermission();
  if (webPermission && webPermission.state !== "prompt") return webPermission.state === "granted";
  const tracker = createForegroundLocationTracker();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let permissionChanged: (() => void) | null = null;
  try {
    return await new Promise<boolean>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(t("Location permission request timed out. Please try again."))), 30_000);
      if (webPermission) {
        permissionChanged = (): void => {
          if (webPermission.state !== "prompt") resolve(webPermission.state === "granted");
        };
        webPermission.addEventListener("change", permissionChanged);
      } else if (native) {
        let checking = false;
        interval = setInterval(() => {
          if (checking) return;
          checking = true;
          void readLocationAuthorization().then(status => {
            if (status !== "notDetermined") resolve(status === "always" || status === "whenInUse");
          }).catch(reject).finally(() => { checking = false; });
        }, 250);
      }
      void tracker.start(
        () => resolve(true),
        error => error.code === "permission-denied" ? resolve(false) : reject(new Error(error.message)),
      ).catch(reject);
    });
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    if (interval !== null) clearInterval(interval);
    if (webPermission && permissionChanged) webPermission.removeEventListener("change", permissionChanged);
    await tracker.stop();
  }
}

/** Obtains a fresh usable position and releases the acquisition watcher before returning it. */
export async function acquireForegroundLocation(): Promise<Coordinate> {
  const tracker = createForegroundLocationTracker();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await new Promise<Coordinate>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(t("Could not find your location. Check location access and try again outside."))), 20_000);
      void tracker.start(point => {
        if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || !Number.isFinite(point.recordedAt)) return;
        if (Date.now() - point.recordedAt > 60_000) return;
        resolve(point);
      }, error => reject(new DOMException(error.message, error.code === "permission-denied" ? "NotAllowedError" : "PositionUnavailableError"))).catch(reject);
    });
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    await tracker.stop();
  }
}
