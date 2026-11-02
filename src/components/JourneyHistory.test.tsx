import { journeyHistoryEntries, journeyWeekStart } from "../journeyHistory";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { discoveryJourneyMetrics } from "../geo";
import { JourneyHistory } from "./JourneyHistory";

describe("JourneyHistory", () => {
  it("keeps a repeated journey with no new ground available on the map", () => {
    const first = [
      { lng: 2.17, lat: 41.38, recordedAt: new Date().setHours(10, 0, 0, 0), walkId: "first" },
      { lng: 2.171, lat: 41.38, recordedAt: new Date().setHours(10, 1, 0, 0), walkId: "first" },
    ];
    const repeated = first.map(point => ({ ...point, recordedAt: point.recordedAt + 120000, walkId: "repeat" }));
    const journeys = discoveryJourneyMetrics([...first, ...repeated]);
    expect(journeys).toHaveLength(2);
    expect(journeys[1].newGroundKm).toBe(0);
    expect(journeys[1].travelledKm).toBeGreaterThan(0);
    const markup = renderToStaticMarkup(<JourneyHistory backLabel="Back" journeys={journeyHistoryEntries(journeys, [])} loading={false} filters={{ weekStart: journeyWeekStart(Date.now()), selectedDay: null }} onFiltersChange={() => undefined} onShowMap={() => undefined} onBack={() => undefined} onClose={() => undefined} />);
    expect(markup.match(/data-testid="journey-history-entry"/g)).toHaveLength(2);
    expect(markup.match(/data-testid="journey-history-show-map"/g)).toHaveLength(2);

  });
  it("includes overnight journeys on the same completion day as the activity chart", () => {
    const selectedDay = new Date(2026, 10, 2).getTime();
    const journeys = discoveryJourneyMetrics([
      { lng: 2.17, lat: 41.38, recordedAt: selectedDay - 60000, walkId: "overnight" },
      { lng: 2.171, lat: 41.38, recordedAt: selectedDay + 60000, walkId: "overnight" },
      { lng: 2.17, lat: 41.38, recordedAt: selectedDay - 3600000, walkId: "previous-day" },
      { lng: 2.171, lat: 41.38, recordedAt: selectedDay - 3500000, walkId: "previous-day" },
    ]);
    const markup = renderToStaticMarkup(<JourneyHistory backLabel="Back" journeys={journeyHistoryEntries(journeys, [])} loading={false} filters={{ weekStart: selectedDay, selectedDay }} onFiltersChange={() => undefined} onShowMap={() => undefined} onBack={() => undefined} onClose={() => undefined} />);
    expect(markup.match(/data-testid="journey-history-entry"/g)).toHaveLength(1);
    expect(markup).toContain(new Date(selectedDay - 60000).toISOString());
    expect(markup).not.toContain(new Date(selectedDay - 3600000).toISOString());
  });

});
