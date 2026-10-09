import {
  isPersonalAchievementId,
  type PersonalAchievementId,
} from "./achievements";
import { supabase } from "./storage";

export type AchievementUnlockState = {
  version: 1 | 2 | 3;
  earned: PersonalAchievementId[];
  pending: PersonalAchievementId[];
};

const keyForUser = (userId: string) =>
  `hecate:achievement-unlocks:v1:${userId}`;

function unique(ids: PersonalAchievementId[]) {
  return [...new Set(ids)];
}

export function confirmedPendingAchievementIds(
  pending: PersonalAchievementId[],
  currentlyEarned: PersonalAchievementId[],
): PersonalAchievementId[] {
  const earned = new Set(currentlyEarned);
  return pending.filter((achievementId) => earned.has(achievementId));
}

export function loadAchievementUnlocks(
  userId: string,
): AchievementUnlockState | null {
  try {
    const stored = JSON.parse(localStorage.getItem(keyForUser(userId)) ?? "null");
    if (!stored || typeof stored !== "object") return null;
    return {
      version: stored.version === 3 ? 3 : stored.version === 2 ? 2 : 1,
      earned: Array.isArray(stored.earned)
        ? unique(stored.earned.filter(isPersonalAchievementId))
        : [],
      pending: Array.isArray(stored.pending)
        ? unique(stored.pending.filter(isPersonalAchievementId))
        : [],
    };
  } catch {
    return null;
  }
}

function saveAchievementUnlocks(
  userId: string,
  state: AchievementUnlockState,
) {
  try {
    localStorage.setItem(keyForUser(userId), JSON.stringify(state));
  } catch {
    /* The current session can still celebrate when storage is unavailable. */
  }
}

export async function syncAchievementUnlocks(
  userId: string,
  currentlyEarned: PersonalAchievementId[],
  localBeforeReconcile: AchievementUnlockState | null,
  locallyNewlyEarned: PersonalAchievementId[],
) {
  const storedLocal = loadAchievementUnlocks(userId);
  if (!storedLocal) return null;
  const local: AchievementUnlockState = {
    ...storedLocal,
    earned: unique(currentlyEarned),
    pending: confirmedPendingAchievementIds(
      storedLocal.pending,
      currentlyEarned,
    ),
  };
  saveAchievementUnlocks(userId, local);
  if (!supabase) return { ...local, newlyEarned: locallyNewlyEarned };
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError || sessionData.session?.user.id !== userId)
    return { ...local, newlyEarned: locallyNewlyEarned };

  const { data, error } = await supabase
    .from("user_achievement_unlocks")
    .select("achievement_id,acknowledged_at")
    .eq("user_id", userId);
  if (error) throw error;

  const rows = (data ?? []).flatMap((row) =>
    isPersonalAchievementId(row.achievement_id)
      ? [
          {
            achievementId: row.achievement_id,
            acknowledged: typeof row.acknowledged_at === "string",
          },
        ]
      : [],
  );
  const currentlyEarnedSet = new Set(currentlyEarned);
  const remoteIds = new Set(rows.map((row) => row.achievementId));
  const localPending = new Set(local.pending);

  if (!rows.length) {
    // First database migration: preserve local pending celebrations, but treat
    // all other historical achievements as acknowledged so they never replay.
    const baseline = unique(currentlyEarned);
    if (baseline.length) {
      const now = new Date().toISOString();
      const { error: insertError } = await supabase
        .from("user_achievement_unlocks")
        .upsert(
          baseline.map((achievementId) => ({
            user_id: userId,
            achievement_id: achievementId,
            acknowledged_at: localPending.has(achievementId) ? null : now,
          })),
          {
            onConflict: "user_id,achievement_id",
            ignoreDuplicates: true,
          },
        );
      if (insertError) throw insertError;
    }
    const databaseWasInitialized = local.version === 3;
    const initialized: AchievementUnlockState = { ...local, version: 3 };
    saveAchievementUnlocks(userId, initialized);
    return {
      ...initialized,
      newlyEarned: databaseWasInitialized
        ? locallyNewlyEarned
        : ([] as PersonalAchievementId[]),
    };
  }

  const staleAcknowledged = rows
    .filter(
      (row) =>
        row.acknowledged && !currentlyEarnedSet.has(row.achievementId),
    )
    .map((row) => row.achievementId);
  if (staleAcknowledged.length) {
    const { error: resetError } = await supabase
      .from("user_achievement_unlocks")
      .update({ acknowledged_at: null })
      .eq("user_id", userId)
      .in("achievement_id", staleAcknowledged);
    if (resetError) throw resetError;
  }

  const earned = unique(currentlyEarned);
  const locallyAcknowledged = new Set(
    localBeforeReconcile
      ? localBeforeReconcile.earned.filter(
          (id) => !localBeforeReconcile.pending.includes(id),
        )
      : [],
  );
  const acknowledgementsToSync = rows
    .filter(
      (row) =>
        currentlyEarnedSet.has(row.achievementId) &&
        !row.acknowledged &&
        locallyAcknowledged.has(row.achievementId),
    )
    .map((row) => row.achievementId);
  if (acknowledgementsToSync.length) {
    const { error: acknowledgeError } = await supabase
      .from("user_achievement_unlocks")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("achievement_id", acknowledgementsToSync);
    if (acknowledgeError) throw acknowledgeError;
  }

  const missing = earned.filter((id) => !remoteIds.has(id));
  if (missing.length) {
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from("user_achievement_unlocks")
      .upsert(
        missing.map((achievementId) => ({
          user_id: userId,
          achievement_id: achievementId,
          acknowledged_at:
            localBeforeReconcile?.earned.includes(achievementId) &&
            !localBeforeReconcile.pending.includes(achievementId)
              ? now
              : null,
        })),
        {
          onConflict: "user_id,achievement_id",
          ignoreDuplicates: true,
        },
      );
    if (insertError) throw insertError;
  }

  const pending = confirmedPendingAchievementIds(
    unique([
      ...rows
        .filter(
          (row) =>
            !row.acknowledged && !locallyAcknowledged.has(row.achievementId),
        )
        .map((row) => row.achievementId),
      ...missing.filter(
        (id) =>
          !localBeforeReconcile?.earned.includes(id) ||
          localBeforeReconcile.pending.includes(id),
      ),
    ]),
    currentlyEarned,
  );
  const merged: AchievementUnlockState = { version: 3, earned, pending };
  saveAchievementUnlocks(userId, merged);
  return {
    ...merged,
    newlyEarned: confirmedPendingAchievementIds(
      unique([
        ...locallyNewlyEarned,
        ...missing.filter(
          (id) => !localBeforeReconcile?.earned.includes(id),
        ),
      ]),
      currentlyEarned,
    ),
  };
}

export async function acknowledgeAchievementUnlock(
  userId: string,
  achievementId: PersonalAchievementId,
) {
  if (!supabase) return;
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || data.session?.user.id !== userId) return;
  const { error } = await supabase
    .from("user_achievement_unlocks")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("achievement_id", achievementId);
  if (error) throw error;
}

export function reconcileAchievementUnlocks(
  userId: string,
  currentlyEarned: PersonalAchievementId[],
) {
  const previous = loadAchievementUnlocks(userId);
  const earned = unique(currentlyEarned);

  // Existing achievements predate the unlock event tracker. Treat them as the
  // baseline instead of presenting every historical badge as newly earned.
  if (!previous) {
    const state: AchievementUnlockState = { version: 2, earned, pending: [] };
    saveAchievementUnlocks(userId, state);
    return { newlyEarned: [] as PersonalAchievementId[], pending: state.pending };
  }

  // Version 1 could temporarily forget acknowledged badges while account data
  // was hydrating. On the first run of the fixed model, use the complete
  // current evaluation as a baseline while preserving genuinely pending items.
  if (previous.version === 1) {
    const state: AchievementUnlockState = {
      version: 2,
      earned,
      pending: confirmedPendingAchievementIds(previous.pending, earned),
    };
    saveAchievementUnlocks(userId, state);
    return { newlyEarned: [] as PersonalAchievementId[], pending: state.pending };
  }

  const known = new Set(previous.earned);
  const newlyEarned = earned.filter((id) => !known.has(id));
  const state: AchievementUnlockState = {
    version: previous.version === 3 ? 3 : 2,
    earned,
    pending: confirmedPendingAchievementIds(
      unique([...previous.pending, ...newlyEarned]),
      earned,
    ),
  };
  saveAchievementUnlocks(userId, state);
  return { newlyEarned, pending: state.pending };
}

export function isAchievementUnlockPending(
  userId: string,
  achievementId: PersonalAchievementId,
) {
  return Boolean(
    loadAchievementUnlocks(userId)?.pending.includes(achievementId),
  );
}

export function dismissAchievementUnlock(
  userId: string,
  achievementId: PersonalAchievementId,
) {
  const previous = loadAchievementUnlocks(userId);
  if (!previous) return;
  saveAchievementUnlocks(userId, {
    ...previous,
    version: previous.version === 3 ? 3 : 2,
    pending: previous.pending.filter((id) => id !== achievementId),
  });
}
