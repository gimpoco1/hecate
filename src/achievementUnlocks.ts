import {
  isPersonalAchievementId,
  type PersonalAchievementId,
} from "./achievements";

type AchievementUnlockState = {
  version: 1 | 2;
  earned: PersonalAchievementId[];
  pending: PersonalAchievementId[];
};

const keyForUser = (userId: string) =>
  `hecate:achievement-unlocks:v1:${userId}`;

function unique(ids: PersonalAchievementId[]) {
  return [...new Set(ids)];
}

export function loadAchievementUnlocks(
  userId: string,
): AchievementUnlockState | null {
  try {
    const stored = JSON.parse(localStorage.getItem(keyForUser(userId)) ?? "null");
    if (!stored || typeof stored !== "object") return null;
    return {
      version: stored.version === 2 ? 2 : 1,
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
      earned: unique([...previous.earned, ...earned]),
      pending: previous.pending,
    };
    saveAchievementUnlocks(userId, state);
    return { newlyEarned: [] as PersonalAchievementId[], pending: state.pending };
  }

  const known = new Set(previous.earned);
  const newlyEarned = earned.filter((id) => !known.has(id));
  const state: AchievementUnlockState = {
    version: 2,
    // Unlocks are permanent. During startup, routes and city boundaries can
    // arrive in separate requests and briefly produce an incomplete earned
    // set. Never let that transient snapshot erase acknowledgement history or
    // the same badge will be celebrated again when the remaining data loads.
    earned: unique([...previous.earned, ...earned]),
    pending: unique([
      ...previous.pending,
      ...newlyEarned,
    ]),
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
    version: 2,
    pending: previous.pending.filter((id) => id !== achievementId),
  });
}
