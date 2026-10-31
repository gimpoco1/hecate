import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileAchievementUnlocks, loadAchievementUnlocks, dismissAchievementUnlock, syncAchievementUnlocks } from "./achievementUnlocks";
import { supabase } from "./storage";

const transport = vi.hoisted(() => ({
  rows: [] as Array<{ achievement_id: string; acknowledged_at: string | null }>,
  writes: [] as Array<{ method: string; body: string }>,
  waitForRead: null as Promise<void> | null,
  readStarted: false,
}));

vi.mock("./storage", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const user = { id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const client = createClient("https://achievement-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user });
      if (!url.includes("/rest/v1/user_achievement_unlocks")) throw new Error(`Unexpected test request: ${url}`);
      if (init?.method === "GET") {
        transport.readStarted = true;
        await transport.waitForRead;
        return Response.json(transport.rows);
      }
      transport.writes.push({ method: String(init?.method), body: String(init?.body) });
      return new Response(null, { status: 204 });
    } },
  });
  return { supabase: client };
});

beforeEach(async () => {
  transport.rows = [];
  transport.writes = [];
  transport.waitForRead = null;
  transport.readStarted = false;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  await supabase!.auth.signInWithPassword({ email: "test@example.invalid", password: "test-password" });
});
afterAll(async () => { await supabase!.auth.dispose(); });

describe("achievement acknowledgement synchronization", () => {
  it("preserves server acknowledgements across an incomplete evaluation and reopening", async () => {
    transport.rows = [{ achievement_id: "momentum", acknowledged_at: "2026-01-01T00:00:00Z" }];
    reconcileAchievementUnlocks("user-1", []);
    const synced = await syncAchievementUnlocks("user-1", [], loadAchievementUnlocks("user-1"), []);
    expect(synced?.acknowledged).toEqual(["momentum"]);
    expect(transport.writes).toEqual([]);
    expect(reconcileAchievementUnlocks("user-1", ["momentum"])).toEqual({ newlyEarned: [], pending: [] });
  });

  it("does not restore a celebration dismissed while its remote read was in flight", async () => {
    transport.rows = [{ achievement_id: "momentum", acknowledged_at: null }];
    let releaseRead: (() => void) | undefined;
    transport.waitForRead = new Promise(resolve => { releaseRead = resolve; });
    reconcileAchievementUnlocks("user-1", []);
    const previous = loadAchievementUnlocks("user-1");
    reconcileAchievementUnlocks("user-1", ["momentum"]);
    const syncing = syncAchievementUnlocks("user-1", ["momentum"], previous, ["momentum"]);
    await vi.waitFor(() => expect(transport.readStarted).toBe(true));
    dismissAchievementUnlock("user-1", "momentum");
    releaseRead!();
    const synced = await syncing;
    expect(synced?.pending).toEqual([]);
    expect(synced?.newlyEarned).toEqual([]);
    expect(loadAchievementUnlocks("user-1")?.pending).toEqual([]);
    await syncAchievementUnlocks("user-1", [], loadAchievementUnlocks("user-1"), []);
    expect(transport.writes.some(write => write.method === "PATCH" && !write.body.includes('"acknowledged_at":null'))).toBe(true);
  });
});
