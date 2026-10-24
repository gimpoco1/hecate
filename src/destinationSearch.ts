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
    const name = [properties.name, properties.street, properties.city].find((text) => typeof text === "string" && text.trim());
    if (typeof name !== "string") throw new TypeError(`Destination search result ${index} has no usable name.`);
    const detail = [...new Set([properties.housenumber, properties.street, properties.city, properties.state, properties.country]
      .filter((text): text is string => typeof text === "string" && text.length > 0 && text !== name))].join(", ");
    return { id: `${lng}:${lat}:${index}`, name, detail, point: { lng, lat } };
  });
}

/** Search is submitted explicitly, rather than issuing a request for every keystroke. */
export async function searchDestinations(query: string, near: RoutePoint | null, signal: AbortSignal): Promise<DestinationResult[]> {
  if (query.trim().length < 3) throw new RangeError("Enter at least three characters to search for a destination.");
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", "5");
  if (near) { url.searchParams.set("lat", String(near.lat)); url.searchParams.set("lon", String(near.lng)); }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Destination search failed (${response.status}): ${await response.text()}. Query: ${query}`);
      return parseDestinations(await response.json());
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
      console.warn("Destination search failed; retrying", { query, attempt, error });
    }
  }
  throw new Error(`Destination search exhausted attempts. Query: ${query}`);
}
