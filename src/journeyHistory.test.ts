import type { CityBoundary } from "./city";
import { describe, expect, it } from "vitest";
import { journeyCityNames, journeyDateValue, parseJourneyDate, journeyWeekStart, shiftJourneyDay } from "./journeyHistory";

describe("journey calendar", () => {
  it("assigns Sunday to its preceding Monday across a year boundary", () => {
    expect(journeyWeekStart(new Date(2027, 0, 3, 23, 59).getTime()))
      .toBe(new Date(2026, 11, 28).getTime());
    expect(journeyWeekStart(new Date(2027, 0, 4).getTime()))
      .toBe(new Date(2027, 0, 4).getTime());
  });

  it("keeps local-midnight day boundaries through daylight-saving weekends", () => {
    for (const start of [new Date(2026, 2, 28), new Date(2026, 9, 24)]) {
      expect(shiftJourneyDay(start.getTime(), 2)).toBe(new Date(2026, start.getMonth(), start.getDate() + 2).getTime());
      expect(shiftJourneyDay(shiftJourneyDay(start.getTime(), 7), -7)).toBe(start.getTime());
    }
  });
});

describe("journey cities", () => {
  const city = (id: string, name: string, west: number, east: number): CityBoundary => ({
    id, name, fetchedAt: 1,
    geometry: { type: "Polygon", coordinates: [[[west, 0], [east, 0], [east, 2], [west, 2], [west, 0]]] },
  });

  it("lists crossed cities once and prefers canonical regions over nested boundaries", () => {
    const boundaries = [city("municipality:one", "Nested city", 0, 1), city("region:one", "First city", 0, 1), city("region:two", "Second city", 1, 2)];
    const points = [.5, .6, 1.5, 3].map((lng, recordedAt) => ({ lng, lat: 1, recordedAt }));
    expect(journeyCityNames(points, boundaries)).toEqual(["First city", "Second city"]);
    expect(journeyCityNames(points, [])).toEqual([]);
  });
});

describe("journey date navigation", () => {
  it("round-trips local dates and selects the containing week across years", () => {
    const selected = parseJourneyDate("2027-01-03");
    expect(selected).toBe(new Date(2027, 0, 3).getTime());
    expect(journeyDateValue(selected)).toBe("2027-01-03");
    expect(journeyWeekStart(selected)).toBe(new Date(2026, 11, 28).getTime());
    expect(journeyDateValue(parseJourneyDate("2028-02-29"))).toBe("2028-02-29");
  });

  it("rejects malformed dates and nonexistent calendar days", () => {
    expect(() => parseJourneyDate("2026-02-29")).toThrow(RangeError);
    expect(() => parseJourneyDate("2026-13-01")).toThrow(RangeError);
    expect(() => parseJourneyDate("01/11/2026")).toThrow(RangeError);
  });
});
