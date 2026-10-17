import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlobalMilestonesSheet, WorldMilestones } from "./WorldMilestones";
import { emptyWalkingStats } from "../walkingStats";

describe("WorldMilestones", () => {
  it("marks the current rank and reports the distance to the next one", () => {
    const markup = renderToStaticMarkup(
      <WorldMilestones travelledKm={1_985} />,
    );

    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Space Station");
    expect(markup).toContain("1,491 km to go");
  });
});

describe("GlobalMilestonesSheet", () => {
  it("renders as a dedicated dialog when open", () => {
    const markup = renderToStaticMarkup(
      <GlobalMilestonesSheet
        open
        discoveryDistance={20}
        travelledKm={42.2}
        walkingStats={{
          ...emptyWalkingStats(),
          walkCount: 4,
          longestWalkKm: 15,
          averageWalkKm: 10.55,
          currentStreakDays: 1,
          bestStreakDays: 3,
        }}
        discoveredCityCount={2}
        backLabel="Back to profile"
        onBack={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Global milestones");
    expect(markup).toContain("Marathon");
    expect(markup).toContain("Personal bests");
    expect(markup).toContain("10.6 km");
    expect(markup).toContain('aria-label="Back to profile"');
  });

  it("does not render while closed", () => {
    const markup = renderToStaticMarkup(
      <GlobalMilestonesSheet
        open={false}
        discoveryDistance={0}
        travelledKm={42.2}
        walkingStats={emptyWalkingStats()}
        discoveredCityCount={0}
        backLabel="Back to journey"
        onBack={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toBe("");
  });
});
