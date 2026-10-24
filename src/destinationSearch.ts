import { cityBounds, cityPointPredicate, type CityBoundary } from "./city";
import type { RoutePoint } from "./explorationRouting";

export type DestinationResult = { id: string; name: string; detail: string; point: RoutePoint };
const SEARCH_URL = import.meta.env.VITE_DESTINATION_SEARCH_URL || "https://photon.komoot.io/api/";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function parseDestinations(value: unknown): DestinationResult[] {
  if (!record(value) || !Array.isArray(value.features)) throw new TypeError("Destination search returned an invalid feature collection.");
  return value.features.map((feature: unknown, index: number): DestinationResult => {
    if (!record(feature) || !record(feature.geometry) || feature.geometry.type !== "Point" ||
      !Array.isArray(feature.geometry.coordinates) || !record(feature.properties)) {
      throw new TypeError(`Destination search returned invalid result ${index}.`);
    }
    const [lng, lat] = feature.geometry.coordinates;
    if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) {
      throw new TypeError(`Destination search returned invalid coordinates for result ${index}.`);
    }
    const properties = feature.properties;
    const streetAddress = typeof properties.street === "string" && properties.street.trim()
      ? [properties.street.trim(), typeof properties.housenumber === "string" ? properties.housenumber.trim() : ""].filter(Boolean).join(" ")
      : undefined;
    const placeName = properties.name === properties.street ? streetAddress : properties.name;
    const name = [placeName, streetAddress, properties.city].find((text) => typeof text === "string" && text.trim());
    if (typeof name !== "string") throw new TypeError(`Destination search result ${index} has no usable name.`);
    const detail = [...new Set([streetAddress, properties.city, properties.state, properties.country]
      .filter((text): text is string => typeof text === "string" && text.length > 0 && text !== name))].join(", ");
    return { id: `${lng}:${lat}:${index}`, name, detail, point: { lng, lat } };
  });
}

/** Restricts suggestions to the current city polygon, including holes and disconnected boundaries. */
export async function searchDestinations(query: string, near: RoutePoint | null, city: CityBoundary, signal: AbortSignal): Promise<DestinationResult[]> {
  if (query.trim().length < 3) throw new RangeError("Enter at least three characters to search for a destination.");
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", "10");
  const bounds = cityBounds(city);
  url.searchParams.set("bbox", [bounds.west, bounds.south, bounds.east, bounds.north].join(","));
  if (near) { url.searchParams.set("lat", String(near.lat)); url.searchParams.set("lon", String(near.lng)); }
  const results = await requestDestinations(url, signal);
  const contains = cityPointPredicate(city);
  return results.filter(({ point }) => contains(point)).slice(0, 5);
}

/** Resolves a nearby name without moving the user's chosen destination to the search result. */
export async function reverseGeocodeDestination(point: RoutePoint, signal: AbortSignal): Promise<DestinationResult> {
  const url = new URL(import.meta.env.VITE_DESTINATION_REVERSE_URL || "/reverse", SEARCH_URL);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("limit", "1");
  url.searchParams.set("radius", "0.1");
  const results = await requestDestinations(url, signal);
  if (results.length === 0) throw new Error("No place or street name was found within 100 m of this destination.");
  return { ...results[0], point };
}

async function requestDestinations(url: URL, signal: AbortSignal): Promise<DestinationResult[]> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Destination lookup failed (${response.status}): ${await response.text()}. Request: ${url}`);
      return parseDestinations(await response.json());
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
      console.warn("Destination lookup failed; retrying", { url: url.href, attempt, error });
    }
  }
  throw new Error(`Destination lookup exhausted attempts. Request: ${url}`);
}
