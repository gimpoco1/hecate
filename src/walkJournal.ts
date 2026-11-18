import { persistentStorage } from "./persistentStorage";
import { t } from "./i18n";
import type { Coordinate, PendingWalk } from "./types";

export type WalkJournal = { active: PendingWalk | null; pending: PendingWalk[] };

const keyForUser = (userId: string) => `hecate:walk-journal:v1:${userId}`;

function validPoint(point: unknown): point is Coordinate {
  if (!point || typeof point !== "object") return false;
  const candidate = point as Partial<Coordinate>;
  return typeof candidate.lng === "number" && Number.isFinite(candidate.lng)
    && candidate.lng >= -180 && candidate.lng <= 180
    && typeof candidate.lat === "number" && Number.isFinite(candidate.lat)
    && candidate.lat >= -90 && candidate.lat <= 90
    && typeof candidate.recordedAt === "number"
    && Number.isFinite(candidate.recordedAt);
}

function validWalkShape(walk: unknown): walk is PendingWalk {
  if (!walk || typeof walk !== "object") return false;
  const candidate = walk as Partial<PendingWalk>;
  return typeof candidate.id === "string" && Number.isFinite(candidate.startedAt)
    && Number.isFinite(candidate.finishedAt) && Array.isArray(candidate.points)
    && candidate.points.every(validPoint);
}

function validCompletedWalk(walk: unknown): walk is PendingWalk {
  return validWalkShape(walk) && walk.points.length >= 2;
}

export async function loadWalkJournalState(userId: string): Promise<WalkJournal> {
  const raw = await persistentStorage.getItem(keyForUser(userId));
  if (raw === null) return { active: null, pending: [] };
  const parsed: { active?: unknown; pending?: unknown } | null = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.pending) || !parsed.pending.every(validCompletedWalk)
      || (parsed.active !== null && !validWalkShape(parsed.active))) {
    throw new Error("The saved journey journal is invalid.");
  }
  const restoreWalkId = (walk: PendingWalk): PendingWalk => ({
    ...walk,
    points: walk.points.map(point => ({ ...point, walkId: walk.id })),
  });
  return {
    active: parsed.active ? restoreWalkId(parsed.active) : null,
    pending: parsed.pending.map(restoreWalkId),
  };
}

export async function saveWalkJournal(userId: string, pending: PendingWalk[], active: PendingWalk | null): Promise<void> {
  const key = keyForUser(userId);
  if (!pending.length && !active) await persistentStorage.removeItem(key);
  else await persistentStorage.setItem(key, JSON.stringify({ pending, active }));
}

/** Persist completion before releasing the active journey or acknowledging its native stop. */
export async function completeWalkJournal(userId: string, pending: PendingWalk[], completed: PendingWalk): Promise<PendingWalk[]> {
  const nextPending = completed.points.length >= 2 && !pending.some(walk => walk.id === completed.id)
    ? [...pending, completed]
    : pending;
  try {
    await saveWalkJournal(userId, nextPending, null);
  } catch (cause) {
    throw new Error(t("Could not save the finished journey on this device. Free up device storage, then retry saving. Keep Hecate open until it is saved."), { cause });
  }
  return nextPending;
}

export async function recoverWalkJournal(userId: string, { active, pending }: WalkJournal, stoppedAt: number | null): Promise<PendingWalk[]> {
  if (!active) return pending;
  return completeWalkJournal(userId, pending, {
    ...active,
    finishedAt: Math.max(active.startedAt, active.points.at(-1)?.recordedAt ?? active.startedAt, stoppedAt ?? active.startedAt),
  });
}
