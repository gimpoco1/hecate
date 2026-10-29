import { describe, expect, it } from "vitest";
import type { CityBoundary } from "./city";
import { travelledCityDistanceKm } from "./cityTravelledDistance";
import { distanceKm } from "./geo";
import type { Coordinate } from "./types";

const city: CityBoundary = { id: "test", name: "Test", fetchedAt: 1, geometry: { type: "Polygon", coordinates: [
  [[0, 0], [.01, 0], [.01, .01], [0, .01], [0, 0]],
  [[.004, .004], [.006, .004], [.006, .006], [.004, .006], [.004, .004]],
] } };
const point = (lng: number, lat: number, recordedAt: number, walkId: string): Coordinate => ({ lng, lat, recordedAt, walkId });

describe("city travelled distance", () => {
  it("counts revisits and a closed loop without crediting only newly discovered ground", () => {
    const a = point(.001, .001, 1, "one");
    const b = point(.002, .001, 10001, "one");
    const c = point(.002, .002, 20001, "one");
    const repeated = [a, b, { ...a, recordedAt: 20001 }, { ...b, recordedAt: 30001 }];
    expect(travelledCityDistanceKm(repeated, city)).toBeCloseTo(distanceKm(a, b) * 3, 5);
    expect(travelledCityDistanceKm([a, b, c, { ...a, recordedAt: 30001 }], city))
      .toBeCloseTo(distanceKm(a, b) + distanceKm(b, c) + distanceKm(c, a), 5);
  });
  it("clips border crossings and city holes without joining separate journeys", () => {
    const route = [point(-.001, .005, 1, "one"), point(.011, .005, 100001, "one")];
    expect(travelledCityDistanceKm(route, city)).toBeCloseTo(distanceKm(point(0, .005, 0, ""), point(.008, .005, 0, "")), 5);
    const separate = [point(.001, .001, 1, "one"), point(.002, .001, 10001, "one"),
      point(.008, .008, 20001, "two"), point(.009, .008, 30001, "two")];
    expect(travelledCityDistanceKm(separate, city)).toBeCloseTo(distanceKm(separate[0], separate[1]) + distanceKm(separate[2], separate[3]), 5);
  });
});
