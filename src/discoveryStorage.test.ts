import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadStoredCells, loadStoredWalkPoints, parseStoredCell, parseStoredWalk } from "./discoveryStorage";

import { routeDistanceKm, splitRoute } from "./geo";

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
  it("preserves pause gaps and exact sample times after a history round trip", () => {
    const start = Date.parse(walk.started_at);
    const restored = parseStoredWalk({ ...walk, finished_at: new Date(start + 660000).toISOString(),
      coordinates: [[2, 41], [2.001, 41], [2.01, 41], [2.011, 41]],
      point_metadata: [[start, false], [start + 60000, false], [start + 600000, true], [start + 660000, false]],
    }).points;
    expect(splitRoute(restored)).toHaveLength(2);
    expect(restored.map(point => point.recordedAt)).toEqual([start, start + 60000, start + 600000, start + 660000]);
    expect(routeDistanceKm(restored)).toBeCloseTo(routeDistanceKm(restored.slice(0, 2)) + routeDistanceKm(restored.slice(2)));
  });

  it("rejects incomplete, out-of-order and malformed pause metadata", () => {
    const start = Date.parse(walk.started_at);
    for (const metadata of [[], [null, null], [[start, false]], [[start, false], [start - 1, true]],
      [[start, false], [start + 61000, true]], [[start, false], [start + 60000, "true"]]]) {
      expect(() => parseStoredWalk({ ...walk, point_metadata: metadata })).toThrow(TypeError);
    }
  });

});

describe("discovery history cancellation", () => {
  it.each([loadStoredWalkPoints, loadStoredCells])("cancels a stalled HTTP history request", async (load) => {
    const controller = new AbortController();
    let received = false;
    const server = createServer(() => { received = true; controller.abort(); });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("History test server did not bind to a TCP port.");
    const client = createClient(`http://127.0.0.1:${address.port}`, "test-public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    try {
      await expect(load(client, controller.signal)).rejects.toHaveProperty("message", expect.stringContaining("AbortError"));
      expect(received).toBe(true);
    } finally {
      await client.auth.dispose();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
