import { describe, expect, it } from "vitest";
import { parseDestinations, searchDestinations } from "./destinationSearch";

describe("destination search", () => {
  it("converts search results into named destinations and rejects invalid coordinates", () => {
    const feature = { geometry: { type: "Point", coordinates: [2.1744, 41.4036] }, properties: { name: "Sagrada Família", city: "Barcelona", country: "Spain" } };
    expect(parseDestinations({ features: [feature] })[0]).toMatchObject({ name: "Sagrada Família", detail: "Barcelona, Spain", point: { lng: 2.1744, lat: 41.4036 } });
    expect(() => parseDestinations({ features: [{ ...feature, geometry: { type: "Point", coordinates: [NaN, 41] } }] })).toThrow("invalid coordinates");
    expect(parseDestinations({ features: [] })).toEqual([]);
  });

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("finds a real destination near Barcelona", async () => {
    const results = await searchDestinations("Sagrada Familia Barcelona", { lat: 41.399, lng: 2.1956 }, AbortSignal.timeout(20_000));
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(({ point }) => Math.abs(point.lat - 41.4036) < 0.01 && Math.abs(point.lng - 2.1744) < 0.01)).toBe(true);
  }, 25_000);
});
