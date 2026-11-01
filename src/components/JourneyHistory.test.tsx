import { journeyWeekStart } from "../journeyHistory";
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
    const markup = renderToStaticMarkup(<JourneyHistory journeys={journeys} cities={[]} filters={{ weekStart: journeyWeekStart(Date.now()), selectedDay: null }} onFiltersChange={() => undefined} onShowMap={() => undefined} onBack={() => undefined} onClose={() => undefined} />);
    expect(markup.match(/data-testid="journey-history-entry"/g)).toHaveLength(2);
    expect(markup.match(/data-testid="journey-history-show-map"/g)).toHaveLength(2);

  });
});
