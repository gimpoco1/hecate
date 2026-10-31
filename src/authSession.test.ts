import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRetryableFetchError, createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { observeAuthSession } from "./authSession";

const clients: SupabaseClient[] = [];
const user = { id: "test-user", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session: Session = {
  access_token: "test-access-token", refresh_token: "test-refresh-token", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
};

function authClient(): SupabaseClient {
  const client = createClient("https://auth-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => new Response(JSON.stringify(session), { status: 200, headers: { "Content-Type": "application/json" } }) },
  });
  clients.push(client);
  return client;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const client of clients.splice(0)) await client.auth.dispose();
});

describe("account session observation", () => {
  it("restores a signed-in session through the real auth client", async () => {
    const client = authClient();
    await client.auth.signInWithPassword({ email: "test@example.invalid", password: "test-password" });
    const onSession = vi.fn();
    const onError = vi.fn();
    const stop = observeAuthSession(client, onSession, onError);
    await vi.waitFor(() => expect(onSession).toHaveBeenCalledWith(expect.objectContaining({ user }), "INITIAL_SESSION"));
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it("reports a temporary session-read failure without publishing a logout", async () => {
    const client = authClient();
    const error = new AuthRetryableFetchError("Session refresh is temporarily unavailable", 503);
    vi.spyOn(client.auth, "getSession").mockResolvedValueOnce({ data: { session: null }, error });
    const onSession = vi.fn();
    const onError = vi.fn();
    const stop = observeAuthSession(client, onSession, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(onSession).not.toHaveBeenCalled();
    stop();
  });

  it("does not let a delayed initial read undo a newer sign-in or sign-out", async () => {
    const client = authClient();
    let resolveRead: ((result: Awaited<ReturnType<typeof client.auth.getSession>>) => void) | undefined;
    vi.spyOn(client.auth, "getSession").mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
    const onSession = vi.fn();
    const onError = vi.fn();
    const stop = observeAuthSession(client, onSession, onError);
    await client.auth.signInWithPassword({ email: "test@example.invalid", password: "test-password" });
    expect(onSession).toHaveBeenLastCalledWith(expect.objectContaining({ user }), "SIGNED_IN");
    await client.auth.signOut({ scope: "local" });
    expect(onSession).toHaveBeenLastCalledWith(null, "SIGNED_OUT");
    const calls = onSession.mock.calls.length;
    resolveRead!({ data: { session }, error: null });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(onSession).toHaveBeenCalledTimes(calls);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it("ignores a pending initial read after its subscriber is removed", async () => {
    const client = authClient();
    const onSession = vi.fn();
    const onError = vi.fn();
    const stop = observeAuthSession(client, onSession, onError);
    stop();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(onSession).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
