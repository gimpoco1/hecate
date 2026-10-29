import { describe, expect, it } from "vitest";
import { parseStoredCell, parseStoredWalk } from "./discoveryStorage";

const walk = { walk_id: "walk", started_at: "2026-01-01T12:00:00Z", finished_at: "2026-01-01T12:01:00Z",
  coordinates: [[2, 41], [2.001, 41.001]], achievement_eligible: false };

describe("stored discovery validation", () => {
  it("preserves import eligibility and reconstructed timestamps", () => {
    const result = parseStoredWalk(walk);
    expect(result.points.map(point => point.achievementEligible)).toEqual([false, false]);
    expect(result.points[1].recordedAt - result.points[0].recordedAt).toBe(60000);
    expect(result.cursor).toEqual({ id: "walk", startedAt: walk.started_at });
  });
  it("rejects malformed geometry and non-finite coordinates instead of silently dropping history", () => {
    expect(() => parseStoredWalk({ ...walk, coordinates: [[181, 41], [2, 41]] })).toThrow();
    expect(() => parseStoredWalk({ ...walk, coordinates: [[NaN, 41], [2, 41]] })).toThrow();
    expect(() => parseStoredWalk({ ...walk, coordinates: [[null, 41], [2, 41]] })).toThrow();
    expect(() => parseStoredCell({ cell_z: 20, cell_x: 2 ** 20, cell_y: 0, first_discovered_at: walk.started_at })).toThrow();
  });
});
