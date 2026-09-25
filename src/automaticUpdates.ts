export const AUTOMATIC_UPDATES_KEY = "hecate:automatic-updates";

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
