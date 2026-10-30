import { t } from "./i18n";
export type JourneyControlRequest = { id: string; requestedAt: number };

export function parseJourneyControlRequest(value: unknown): JourneyControlRequest | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new TypeError(t("The iOS journey control returned an invalid request."));
  const request = value as Partial<JourneyControlRequest>;
  if (typeof request.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.id) ||
    typeof request.requestedAt !== "number" || !Number.isFinite(request.requestedAt) || request.requestedAt <= 0) {
    throw new TypeError(t("The iOS journey control request has an invalid ID or timestamp."));
  }
  return { id: request.id, requestedAt: request.requestedAt };
}

/** Prevents an old Lock Screen action from unexpectedly changing a journey after a later launch. */
export function assertFreshJourneyControlRequest(request: JourneyControlRequest, now: number): void {
  if (now < request.requestedAt || now - request.requestedAt > 120_000) {
    throw new RangeError(t("The journey control request expired. Tap the control again to start or stop your journey."));
  }
}
