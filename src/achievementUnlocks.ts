import {
  isPersonalAchievementId,
  type PersonalAchievementId,
} from "./achievements";

type AchievementUnlockState = {
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
    const state: AchievementUnlockState = { earned, pending: [] };
    saveAchievementUnlocks(userId, state);
    return { newlyEarned: [] as PersonalAchievementId[], pending: state.pending };
  }

  const known = new Set(previous.earned);
  const newlyEarned = earned.filter((id) => !known.has(id));
  const state: AchievementUnlockState = {
    earned,
    pending: unique([
      ...previous.pending.filter((id) => earned.includes(id)),
      ...newlyEarned,
    ]),
  };
  saveAchievementUnlocks(userId, state);
  return { newlyEarned, pending: state.pending };
}

export function dismissAchievementUnlock(
  userId: string,
  achievementId: PersonalAchievementId,
) {
  const previous = loadAchievementUnlocks(userId);
  if (!previous) return;
  saveAchievementUnlocks(userId, {
    ...previous,
    pending: previous.pending.filter((id) => id !== achievementId),
  });
}
