export const AUTOMATIC_UPDATES_KEY = "hecate:automatic-updates";
const AUTOMATIC_UPDATE_PENDING_PREFIX = "hecate:leaderboard-update-pending:v1:";

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function isAutomaticUpdatesEnabled() {
  const storage = getStorage();
  if (!storage) return true;
  try {
    return storage.getItem(AUTOMATIC_UPDATES_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutomaticUpdatesEnabled(next: boolean) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(AUTOMATIC_UPDATES_KEY, String(next));
  } catch {
    // Storage may be unavailable in some restricted contexts.
  }
}

export function isAutomaticUpdatePending(userId: string) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return (
      storage.getItem(`${AUTOMATIC_UPDATE_PENDING_PREFIX}${userId}`) === "true"
    );
  } catch {
    return false;
  }
}

export function setAutomaticUpdatePending(userId: string, pending: boolean) {
  const storage = getStorage();
  if (!storage) return;
  const key = `${AUTOMATIC_UPDATE_PENDING_PREFIX}${userId}`;
  try {
    if (pending) storage.setItem(key, "true");
    else storage.removeItem(key);
  } catch {
    // Storage may be unavailable in some restricted contexts.
  }
}
