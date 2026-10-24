import { metropolitanCityForPoint, isPointInCity } from "./city";
import { describe, expect, it } from "vitest";
import { parseDestinations, reverseGeocodeDestination, searchDestinations } from "./destinationSearch";

describe("destination search", () => {
  it("converts search results into named destinations and rejects invalid coordinates", () => {
    const feature = { geometry: { type: "Point", coordinates: [2.1744, 41.4036] }, properties: { name: "Sagrada Família", city: "Barcelona", country: "Spain" } };
    expect(parseDestinations({ features: [feature] })[0]).toMatchObject({ name: "Sagrada Família", detail: "Barcelona, Spain", point: { lng: 2.1744, lat: 41.4036 } });
    expect(() => parseDestinations({ features: [{ ...feature, geometry: { type: "Point", coordinates: [NaN, 41] } }] })).toThrow("invalid coordinates");
    expect(parseDestinations({ features: [] })).toEqual([]);
  });

  it("includes house numbers in street destinations while preserving named places", () => {
    const geometry = { type: "Point", coordinates: [2.1744, 41.4036] };
    const address = { street: "Carrer de Mallorca", housenumber: "401", city: "Barcelona" };
    expect(parseDestinations({ features: [{ geometry, properties: address }] })[0]).toMatchObject({ name: "Carrer de Mallorca 401", detail: "Barcelona" });
    expect(parseDestinations({ features: [{ geometry, properties: { ...address, name: address.street } }] })[0].name).toBe("Carrer de Mallorca 401");
    expect(parseDestinations({ features: [{ geometry, properties: { ...address, name: "Sagrada Família" } }] })[0]).toMatchObject({ name: "Sagrada Família", detail: "Carrer de Mallorca 401, Barcelona" });
  });

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("names a map destination while preserving the exact selected point", async () => {
    const point = { lat: 41.4036, lng: 2.1744 };
    const result = await reverseGeocodeDestination(point, AbortSignal.timeout(20_000));
    expect(result.name.length).toBeGreaterThan(0);
    expect(result.point).toEqual(point);
  }, 25_000);

  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("finds a real destination near Barcelona", async () => {
    const near = { lat: 41.399, lng: 2.1956 };
    const city = await metropolitanCityForPoint(near);
    if (!city) throw new Error("Barcelona city boundary is unavailable for the integration test.");
    const results = await searchDestinations("Sagrada Familia Barcelona", near, city, AbortSignal.timeout(20_000));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ point }) => isPointInCity(point, city))).toBe(true);
    expect(results.some(({ point }) => Math.abs(point.lat - 41.4036) < 0.01 && Math.abs(point.lng - 2.1744) < 0.01)).toBe(true);
  }, 25_000);
  it.runIf(import.meta.env.VITE_ROUTING_INTEGRATION === "1")("does not suggest an outside-city landmark", async () => {
    const near = { lat: 41.399, lng: 2.1956 };
    const city = await metropolitanCityForPoint(near);
    if (!city) throw new Error("Barcelona city boundary is unavailable for the integration test.");
    const results = await searchDestinations("Buckingham Palace London", near, city, AbortSignal.timeout(20_000));
    expect(results).toEqual([]);
  }, 25_000);

});
