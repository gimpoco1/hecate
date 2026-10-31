import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

/** Keep failed or stale initial reads from overwriting authoritative auth events. */
export function observeAuthSession(
  client: SupabaseClient,
  onSession: (session: Session | null, event: AuthChangeEvent) => void,
  onError: (error: Error) => void,
): () => void {
  let active = true;
  let changed = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    // The SDK also emits a null INITIAL_SESSION when its storage/refresh read
    // fails. The explicit getSession below distinguishes that failure from logout.
    if (!active || event === "INITIAL_SESSION") return;
    changed = true;
    onSession(session, event);
  });
  void client.auth.getSession().then(({ data, error }) => {
    if (!active || changed) return;
    if (error) onError(error);
    else onSession(data.session, "INITIAL_SESSION");
  }).catch((error: Error) => {
    if (active && !changed) onError(error);
  });
  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
