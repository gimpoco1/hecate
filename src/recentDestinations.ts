import { t } from "./i18n";
import type { RoutePoint } from "./explorationRouting";
import type { DestinationResult } from "./destinationSearch";

const HISTORY_LIMIT = 6;

function storageKey(userId: string | null): string {
  return `hecate:recent-destinations:v1:${userId ?? "guest"}`;
}

export function parseRecentDestinations(value: unknown): DestinationResult[] {
  if (!Array.isArray(value)) throw new TypeError(t("Recent destinations must be a list. Clear history to reset it."));
  return value.map((entry: unknown): DestinationResult => {
    if (!entry || typeof entry !== "object") throw new TypeError(t("A recent destination is invalid. Clear history to reset it."));
    const result = entry as Partial<DestinationResult>;
    if (typeof result.id !== "string" || typeof result.name !== "string" || !result.name.trim() || typeof result.detail !== "string" ||
      !result.point || typeof result.point.lat !== "number" || !Number.isFinite(result.point.lat) || Math.abs(result.point.lat) > 85 ||
      typeof result.point.lng !== "number" || !Number.isFinite(result.point.lng) || Math.abs(result.point.lng) > 180) {
      throw new TypeError(t("A recent destination has invalid name or coordinates. Clear history to reset it."));
    }
    return { id: result.id, name: result.name, detail: result.detail, point: { lng: result.point.lng, lat: result.point.lat } };
  }).slice(0, HISTORY_LIMIT);
}

export function loadRecentDestinations(userId: string | null): DestinationResult[] {
  const stored = localStorage.getItem(storageKey(userId));
  return stored === null ? [] : parseRecentDestinations(JSON.parse(stored));
}

/** Moves a selected destination to the front without duplicating it or changing the previous list. */
export function withRecentDestination(previous: readonly DestinationResult[], destination: DestinationResult): DestinationResult[] {
  return [destination, ...previous.filter(({ point }) => point.lng !== destination.point.lng || point.lat !== destination.point.lat)].slice(0, HISTORY_LIMIT);
}

export function saveRecentDestinations(userId: string | null, destinations: readonly DestinationResult[]): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(destinations.slice(0, HISTORY_LIMIT)));
}

export function clearRecentDestinations(userId: string | null): void {
  localStorage.removeItem(storageKey(userId));
}

/** Uses saved-place names first and only applies a geocoded name to the point it describes. */
export function recentDestinationFromSelection(destination: RoutePoint & { name?: string }, resolved: DestinationResult | null): DestinationResult {
  const matching = resolved?.point.lng === destination.lng && resolved.point.lat === destination.lat ? resolved : null;
  return {
    id: matching?.id ?? `${destination.lng}:${destination.lat}`,
    name: destination.name ?? matching?.name ?? t("Selected point"),
    detail: matching?.detail ?? `${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}`,
    point: { lng: destination.lng, lat: destination.lat },
  };
}
