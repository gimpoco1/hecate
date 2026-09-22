import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalCityForStoredBoundary,
  cityAreaKm2,
  cityForMapCenter,
  discoveredCityAreaKm2,
  discoveredCityCellDistanceKm,
  discoveredCityDistanceKm,
  discoveredCityPercentage,
  fetchCityBoundary,
  isPointInCity,
  metropolitanCityForPoint,
  preferredCityForView,
  type CityBoundary,
} from "./city";
import { pointToDiscoveryCell } from "./geo";

const city: CityBoundary = {
  id: "test:city",
  name: "Test City",
  fetchedAt: 0,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-0.01, -0.01],
        [0.01, -0.01],
        [0.01, 0.01],
        [-0.01, 0.01],
        [-0.01, -0.01],
      ],
    ],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("city discovery", () => {
  it("checks whether points are inside the municipal polygon", () => {
    expect(isPointInCity({ lng: 0, lat: 0 }, city)).toBe(true);
    expect(isPointInCity({ lng: 0.02, lat: 0 }, city)).toBe(false);
  });

  it("selects the city under the map center and prefers its larger region", () => {
    const largerRegion = { ...city, id: "region:test", name: "Test Region" };
    expect(cityForMapCenter({ lng: 0, lat: 0 }, [city, largerRegion])).toBe(
      largerRegion,
    );
    expect(
      cityForMapCenter({ lng: 0.02, lat: 0 }, [city, largerRegion]),
    ).toBeNull();
  });

  it("prefers the map-focused city over the user location when zoomed elsewhere", () => {
    const currentCity = { ...city, id: "test:current", name: "Current city" };
    const viewedCity: CityBoundary = {
      ...city,
      id: "test:viewed",
      name: "Viewed city",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2, 2],
            [2.1, 2],
            [2.1, 2.1],
            [2, 2.1],
            [2, 2],
          ],
        ],
      },
    };
    expect(
      preferredCityForView(
        { lng: 2.05, lat: 2.05 },
        currentCity,
        viewedCity,
        [],
      ),
    ).toBe(viewedCity);
  });

  it("calculates a plausible polygon area", () => {
    expect(cityAreaKm2(city)).toBeGreaterThan(4);
    expect(cityAreaKm2(city)).toBeLessThan(6);
  });

  it("turns revealed cells into a bounded percentage", () => {
    const cell = pointToDiscoveryCell({ lng: 0, lat: 0, recordedAt: 1 });
    const percentage = discoveredCityPercentage([cell], city);
    expect(percentage).toBeGreaterThan(0);
    expect(percentage).toBeLessThan(1);
  });

  it("does not increase coverage when the same place is discovered repeatedly", () => {
    const cell = pointToDiscoveryCell({ lng: 0, lat: 0, recordedAt: 1 });
    const repeatedVisit = { ...cell, discoveredAt: 2 };
    expect(discoveredCityPercentage([cell, repeatedVisit], city)).toBe(
      discoveredCityPercentage([cell], city),
    );
    expect(discoveredCityAreaKm2([cell, repeatedVisit], city)).toBe(
      discoveredCityAreaKm2([cell], city),
    );
  });

  it("counts only new discovery distance within a city", () => {
    const start = { lng: 0, lat: 0, recordedAt: 1 };
    const newGround = { lng: 0.001, lat: 0, recordedAt: 2 };
    const repeatStreet = { ...start, recordedAt: 3 };
    const distance = discoveredCityDistanceKm(
      [start, newGround, repeatStreet],
      city,
    );
    expect(distance).toBeGreaterThan(0.05);
    expect(distance).toBeLessThanOrEqual(0.111);
  });

  it("derives a meaningful city distance from synced discovery cells", () => {
    const start = { lng: 0, lat: 0, recordedAt: 1 };
    const newGround = { lng: 0.001, lat: 0, recordedAt: 2 };
    const cells = [
      pointToDiscoveryCell(start),
      pointToDiscoveryCell(newGround),
    ];
    expect(discoveredCityCellDistanceKm(cells, city)).toBeGreaterThan(0.05);
  });

  it("does not add city distance for a repeated synced cell", () => {
    const cell = pointToDiscoveryCell({ lng: 0, lat: 0, recordedAt: 1 });
    expect(
      discoveredCityCellDistanceKm([cell, { ...cell, discoveredAt: 2 }], city),
    ).toBe(discoveredCityCellDistanceKm([cell], city));
  });

  it("groups Westminster into Greater London with the matching boundary", async () => {
    const city = await fetchCityBoundary({ lng: -0.127, lat: 51.501 });
    expect(city.id).toBe("region:greater-london");
    expect(city.name).toBe("Greater London");
    expect(isPointInCity({ lng: -0.127, lat: 51.501 }, city)).toBe(true);
    expect(cityAreaKm2(city)).toBeGreaterThan(1_000);
  });

  it("groups El Prat and Barcelona into the same metropolitan area", async () => {
    const elPrat = await fetchCityBoundary({ lng: 2.095, lat: 41.327 });
    const barcelona = await fetchCityBoundary({ lng: 2.17, lat: 41.38 });
    expect(elPrat.id).toBe("region:barcelona-metropolitan");
    expect(barcelona.id).toBe(elPrat.id);
    expect(elPrat.name).toBe("Barcelona");
    expect(cityAreaKm2(elPrat)).toBeGreaterThan(500);
    expect(cityAreaKm2(elPrat)).toBeLessThan(800);
    expect(
      await metropolitanCityForPoint({ lng: -122.42, lat: 37.77 }),
    ).toBeNull();
  });

  it("groups Manhattan with the full New York City boundary", async () => {
    const manhattan = await fetchCityBoundary({ lng: -73.985, lat: 40.758 });
    const queens = await fetchCityBoundary({ lng: -73.79, lat: 40.73 });
    expect(manhattan.id).toBe("region:new-york");
    expect(queens.id).toBe(manhattan.id);
    expect(cityAreaKm2(manhattan)).toBeGreaterThan(500);
  });

  it("relabels a stored municipality using the metropolitan geometry", async () => {
    const local: CityBoundary = {
      ...city,
      id: "relation:345761",
      name: "el Prat de Llobregat",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.09, 41.32],
            [2.1, 41.32],
            [2.1, 41.33],
            [2.09, 41.33],
            [2.09, 41.32],
          ],
        ],
      },
    };
    const canonical = await canonicalCityForStoredBoundary(local);
    expect(canonical.id).toBe("region:barcelona-metropolitan");
    expect(isPointInCity({ lng: 2.095, lat: 41.327 }, canonical)).toBe(true);
  });

  it("uses the returned polygon name and rejects a nearby non-containing boundary", async () => {
    vi.stubGlobal("navigator", { language: "en" });
    const point = { lng: 0, lat: 0 };
    const feature = {
      type: "Feature",
      properties: {
        osm_type: "relation",
        osm_id: 123,
        name: "Local Borough",
        address: { city: "Parent City" },
      },
      geometry: city.geometry,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchCityBoundary(point)).name).toBe("Local Borough");

    feature.geometry = {
      type: "Polygon",
      coordinates: [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1],
        ],
      ],
    };
    await expect(fetchCityBoundary(point)).rejects.toThrow("does not contain");
  });
});
