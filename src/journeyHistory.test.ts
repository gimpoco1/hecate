import { describe, expect, it } from "vitest";
import { journeyWeekStart, shiftJourneyDay } from "./journeyHistory";

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
