import {
  isPersonalAchievementId,
  type PersonalAchievementId,
} from "./achievements";
import { supabase } from "./storage";

export type AchievementUnlockState = {
  version: 1 | 2 | 3;
  earned: PersonalAchievementId[];
  pending: PersonalAchievementId[];
  acknowledged: PersonalAchievementId[];
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
    const earned: PersonalAchievementId[] = Array.isArray(stored.earned)
      ? unique(stored.earned.filter(isPersonalAchievementId))
      : [];
    const pending: PersonalAchievementId[] = Array.isArray(stored.pending)
      ? unique(stored.pending.filter(isPersonalAchievementId))
      : [];
    return {
      version: stored.version === 3 ? 3 : stored.version === 2 ? 2 : 1,
      earned,
      pending,
      acknowledged: Array.isArray(stored.acknowledged)
        ? unique(stored.acknowledged.filter(isPersonalAchievementId))
        : earned.filter(id => !pending.includes(id)),
    };
  } catch {
    return null;
  }
}

function saveAchievementUnlocks(
  userId: string,
  state: AchievementUnlockState,
) {
  const acknowledged = unique([
    ...(loadAchievementUnlocks(userId)?.acknowledged ?? []),
    ...state.acknowledged,
  ]);
  const saved = {
    ...state,
    acknowledged,
    pending: state.pending.filter(id => !acknowledged.includes(id)),
  };
  localStorage.setItem(keyForUser(userId), JSON.stringify(saved));
  return saved;
}

export async function syncAchievementUnlocks(
  userId: string,
  currentlyEarned: PersonalAchievementId[],
  localBeforeReconcile: AchievementUnlockState | null,
  locallyNewlyEarned: PersonalAchievementId[],
) {
  const storedLocal = loadAchievementUnlocks(userId);
  if (!storedLocal) return null;
  const local = saveAchievementUnlocks(userId, {
    ...storedLocal,
    earned: unique(currentlyEarned),
    pending: confirmedPendingAchievementIds(
      storedLocal.pending,
      currentlyEarned,
    ),
  });
  if (!supabase) return { ...local, newlyEarned: locallyNewlyEarned };
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user.id !== userId)
    throw new Error("The signed-in account changed before achievement unlocks could sync.");

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
  const remoteIds = new Set(rows.map((row) => row.achievementId));
  const localPending = new Set(local.pending);

  if (!rows.length) {
    // First database migration: preserve local pending celebrations, but treat
    // all other historical achievements as acknowledged so they never replay.
    const baseline = unique([...currentlyEarned, ...local.acknowledged]);
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
    const saved = saveAchievementUnlocks(userId, initialized);
    return {
      ...saved,
      newlyEarned: databaseWasInitialized
        ? locallyNewlyEarned.filter(id => !saved.acknowledged.includes(id))
        : ([] as PersonalAchievementId[]),
    };
  }

  const earned = unique(currentlyEarned);
  const locallyAcknowledged = new Set(
    unique([
      ...local.acknowledged,
      ...(localBeforeReconcile?.acknowledged ?? []),
    ]),
  );
  const acknowledgementsToSync = rows
    .filter(
      (row) =>
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

  const missing = unique([...earned, ...locallyAcknowledged]).filter((id) => !remoteIds.has(id));
  if (missing.length) {
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from("user_achievement_unlocks")
      .upsert(
        missing.map((achievementId) => ({
          user_id: userId,
          achievement_id: achievementId,
          acknowledged_at:
            locallyAcknowledged.has(achievementId)
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
  const merged = saveAchievementUnlocks(userId, {
    version: 3,
    earned,
    pending,
    acknowledged: unique([
      ...locallyAcknowledged,
      ...rows.filter(row => row.acknowledged).map(row => row.achievementId),
    ]),
  });
  return {
    ...merged,
    newlyEarned: confirmedPendingAchievementIds(
      unique([
        ...locallyNewlyEarned,
        ...missing.filter(
          (id) => !localBeforeReconcile?.earned.includes(id),
        ),
      ]),
      currentlyEarned.filter(id => !merged.acknowledged.includes(id)),
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
    const state: AchievementUnlockState = { version: 2, earned, pending: [], acknowledged: earned };
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
      acknowledged: unique([...previous.acknowledged, ...earned.filter(id => !previous.pending.includes(id))]),
    };
    saveAchievementUnlocks(userId, state);
    return { newlyEarned: [] as PersonalAchievementId[], pending: state.pending };
  }

  const known = new Set([...previous.earned, ...previous.acknowledged]);
  const newlyEarned = earned.filter((id) => !known.has(id));
  const state: AchievementUnlockState = {
    version: previous.version === 3 ? 3 : 2,
    earned,
    acknowledged: previous.acknowledged,
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
    acknowledged: unique([...previous.acknowledged, achievementId]),
  });
}
