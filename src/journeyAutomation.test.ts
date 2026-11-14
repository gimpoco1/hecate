import { describe, expect, it } from "vitest";
import { inactivityDeadlineBeforeMovement } from "./journeyAutomation";

const idle = 1700000000000;
describe("inactivity after an adaptive location suspension", () => {
  it("ends an expired idle period before the next movement can resume the old journey", () => {
    expect(inactivityDeadlineBeforeMovement(idle, { activity: "walking", since: idle + 10 * 60000 }, 7)).toBe(idle);
  });
  it("uses movement onset instead of delayed delivery time", () => {
    expect(inactivityDeadlineBeforeMovement(idle, { activity: "walking", since: idle + 4 * 60000 }, 7)).toBeNull();
  });
  it("accounts for a missed pause deadline when walking or cycling resumes", () => {
    for (const activity of ["walking", "cycling"] as const) {
      expect(inactivityDeadlineBeforeMovement(idle, { activity, since: idle + 3 * 60000 }, 2)).toBe(idle);
    }
  });
  it("does not treat unknown motion or driving as a confirmed resume", () => {
    for (const activity of ["unknown", "other", "stationary"] as const) {
      expect(inactivityDeadlineBeforeMovement(idle, { activity, since: idle + 10 * 60000 }, 2)).toBeNull();
    }
  });
  it("keeps shorter stops and missing inactivity from creating a pause", () => {
    expect(inactivityDeadlineBeforeMovement(idle, { activity: "walking", since: idle + 60000 }, 2)).toBeNull();
    expect(inactivityDeadlineBeforeMovement(null, { activity: "walking", since: idle + 60000 }, 2)).toBeNull();
  });
});
