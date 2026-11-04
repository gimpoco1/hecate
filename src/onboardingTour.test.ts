import { describe, expect, it } from "vitest";
import { nextTourStep, parseTourStep, TOUR_STEPS } from "./onboardingTour";

describe("map walkthrough progress", () => {
  it("starts new installations at the journey control and restores saved progress", () => {
    expect(parseTourStep(null)).toBe("start");
    for (const step of [...TOUR_STEPS, "finished"]) expect(parseTourStep(step)).toBe(step);
    expect(() => parseTourStep("invalid")).toThrow(TypeError);
  });

  it("advances through controls in order without requiring a recorded journey", () => {
    expect(TOUR_STEPS.reduce((step, completed) => nextTourStep(step, completed), parseTourStep(null))).toBe("finished");
    expect(nextTourStep("start", "start")).toBe("stats");
    expect(nextTourStep("stats", "stats")).toBe("navigation");
    expect(nextTourStep("navigation", "navigation")).toBe("save");
    expect(nextTourStep("save", "save")).toBe("city");
    expect(nextTourStep("city", "city")).toBe("profile");
    expect(nextTourStep("profile", "profile")).toBe("finished");
    expect(nextTourStep("finished", "finished")).toBe("done");
  });

  it("ignores unrelated actions and leaves a dismissed tour complete", () => {
    expect(nextTourStep("start", "save")).toBe("start");
    expect(nextTourStep("save", "start")).toBe("save");
    for (const action of TOUR_STEPS) expect(nextTourStep("done", action)).toBe("done");
  });
});
