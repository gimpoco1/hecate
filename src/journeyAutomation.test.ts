import { describe, expect, it } from "vitest";
import { advanceCandidateWalkingClock, candidateWalkingDuration, inactivityDeadlineBeforeMovement, type CandidateWalkingClock } from "./journeyAutomation";

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

describe("automatic start grace period", () => {
  const clock: CandidateWalkingClock = { walkingMs: 0, walkingSince: idle, interruptedAt: null };
  it("keeps three minutes of walking across a two-minute traffic-light stop", () => {
    const stopped = advanceCandidateWalkingClock(clock, { activity: "stationary", since: idle + 180000 });
    expect(stopped).not.toBeNull();
    const resumed = advanceCandidateWalkingClock(stopped!, { activity: "walking", since: idle + 300000 });
    expect(resumed).not.toBeNull();
    expect(candidateWalkingDuration(resumed!, idle + 419999)).toBe(299999);
    expect(candidateWalkingDuration(resumed!, idle + 420000)).toBe(300000);
  });
  it("does not count unknown readings as walking or let repeated readings extend grace", () => {
    const uncertain = advanceCandidateWalkingClock(clock, { activity: "unknown", since: idle + 180000 });
    expect(candidateWalkingDuration(uncertain!, idle + 240000)).toBe(180000);
    const stopped = advanceCandidateWalkingClock(uncertain!, { activity: "stationary", since: idle + 250000 });
    expect(stopped?.interruptedAt).toBe(idle + 180000);
    expect(advanceCandidateWalkingClock(stopped!, { activity: "walking", since: idle + 300001 })).toBeNull();
  });
  it("uses movement onset when the resume update arrives late", () => {
    const stopped = advanceCandidateWalkingClock(clock, { activity: "stationary", since: idle + 180000 });
    const resumed = advanceCandidateWalkingClock(stopped!, { activity: "walking", since: idle + 240000 });
    expect(candidateWalkingDuration(resumed!, idle + 360000)).toBe(300000);
  });
  it("combines multiple brief stops without counting either as walking", () => {
    const stopped = advanceCandidateWalkingClock(clock, { activity: "stationary", since: idle + 120000 });
    const resumed = advanceCandidateWalkingClock(stopped!, { activity: "walking", since: idle + 180000 });
    const secondStop = advanceCandidateWalkingClock(resumed!, { activity: "stationary", since: idle + 240000 });
    const secondResume = advanceCandidateWalkingClock(secondStop!, { activity: "walking", since: idle + 300000 });
    expect(candidateWalkingDuration(secondResume!, idle + 420000)).toBe(300000);
  });
  it("discards a walking candidate when switching to cycling or driving", () => {
    for (const activity of ["cycling", "other"] as const) expect(advanceCandidateWalkingClock(clock, { activity, since: idle + 180000 })).toBeNull();
  });
});
