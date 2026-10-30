import { t } from "./i18n";
import { errorDiagnostic } from "./diagnostics";
import { CityNotFoundError, fetchCityBoundary, isPointInCity, type CityBoundary } from "./city";
import { distanceKm, isUsableGpsPoint } from "./geo";
import type { LocationTracker, LocationTrackerError } from "./location";
import type { Coordinate } from "./types";
import { JOURNEY_SPEED_STOP_MESSAGE } from "./journeyNotifications";

// A generous ceiling for walking/running; GPS uncertainty is deducted below.
const MAX_JOURNEY_SPEED_MPS = 15;

export function isJourneyTooFast(previous: Coordinate | undefined, point: Coordinate): boolean {
  if (point.speed !== undefined && Number.isFinite(point.speed) && point.speed > MAX_JOURNEY_SPEED_MPS) return true;
  if (!previous) return false;
  const seconds = (point.recordedAt - previous.recordedAt) / 1_000;
  if (seconds <= 0) return false;
  const minimumDistance = Math.max(0,
    distanceKm(previous, point) * 1_000 - (previous.accuracy ?? 0) - (point.accuracy ?? 0));
  return minimumDistance / seconds > MAX_JOURNEY_SPEED_MPS;
}

async function verifyJourneyCity(point: Coordinate, signal: AbortSignal): Promise<CityBoundary> {
  for (let attempt = 1; ; attempt += 1) {
    const request = new AbortController();
    const cancel = (): void => request.abort();
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) request.abort();
    const timeout = setTimeout(cancel, 15_000);
    try {
      return await fetchCityBoundary(point, request.signal);
    } catch (error) {
      if (signal.aborted || error instanceof CityNotFoundError || attempt === 3) throw error;
      console.warn("Journey city verification failed; retrying", { attempt, error: errorDiagnostic(error) });
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 300));
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }
}

/** Validate fixes before they can change the route, discovery cells or journal. */
export function createJourneyRecordingTracker(tracker: LocationTracker, cities: CityBoundary[]): LocationTracker {
  let active = false;
  let previous: Coordinate | undefined;
  let knownCities = [...cities];
  let queue: Promise<void> = Promise.resolve();
  const controller = new AbortController();
  return {
    async start(onPoint, onError): Promise<void> {
      active = true;
      const fail = (error: LocationTrackerError): void => {
        if (!active) return;
        active = false;
        controller.abort();
        onError(error);
      };
      await tracker.start((point) => {
        if (!active || !isUsableGpsPoint(point)) return;
        queue = queue.then(async () => {
          if (!active) return;
          // Ignore duplicate/out-of-order fixes instead of comparing them with a newer position.
          if (previous && point.recordedAt <= previous.recordedAt) return;
          if (isJourneyTooFast(previous, point)) {
            fail({ code: "speed-exceeded", message: t(JOURNEY_SPEED_STOP_MESSAGE) });
            return;
          }
          previous = point;
          if (!knownCities.some((city) => isPointInCity(point, city))) {
            const city = await verifyJourneyCity(point, controller.signal);
            if (!active) return;
            knownCities = [...knownCities, city];
          }
          if (active) onPoint(point);
        }).catch((error: Error) => {
          if (!active) return;
          console.warn("Journey location could not be verified", { error: errorDiagnostic(error) });
          fail({
            code: "journey-stopped",
            message: error instanceof CityNotFoundError
              ? t("Journey stopped because you are outside a recognized city. Your recorded walking progress has been saved.")
              : t("Journey stopped because the city boundary could not be verified. Check your connection and start again. Your recorded walking progress has been saved."),
          });
        });
      }, fail);
    },
    async stop(): Promise<void> {
      active = false;
      controller.abort();
      await tracker.stop();
    },
  };
}
