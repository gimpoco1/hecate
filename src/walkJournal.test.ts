import { beforeEach, describe, expect, it, vi } from "vitest";
import { canResumeWalk, completeWalkJournal, recoverWalkJournal, loadWalkJournalState, saveWalkJournal } from "./walkJournal";
import type { PendingWalk } from "./types";

const walk: PendingWalk = {
  id: "walk-1",
  startedAt: 1_000,
  finishedAt: 2_000,
  points: [
    { lng: 2.17, lat: 41.38, recordedAt: 1_000, walkId: "walk-1" },
    { lng: 2.171, lat: 41.38, recordedAt: 2_000, walkId: "walk-1" },
  ],
};

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  });
});

describe("walk recovery journal", () => {
  it("continues a WebView reload in the same process and saves at the last fix after a cold launch", async () => {
    await saveWalkJournal("user-a", [], { ...walk, nativeProcessId: "before", finishedAt: 90_000 });
    const journal = await loadWalkJournalState("user-a");
    if (!journal.active) throw new Error("Active journey checkpoint is missing.");
    expect(canResumeWalk(journal.active, "before")).toBe(true);
    expect(canResumeWalk(journal.active, "after")).toBe(false);
    expect(canResumeWalk(walk, "after")).toBe(false);
    expect(canResumeWalk(walk, null)).toBe(true);
    expect(await recoverWalkJournal("user-a", journal, null)).toEqual([walk]);
  });

  it("restores an interrupted active walk and keeps accounts separate", async () => {
    await saveWalkJournal("user-a", [], { ...walk, finishedAt: 90_000 });
    expect(await recoverWalkJournal("user-b", await loadWalkJournalState("user-b"), null)).toEqual([]);
    expect(await recoverWalkJournal("user-a", await loadWalkJournalState("user-a"), null)).toEqual([walk]);
    expect(await loadWalkJournalState("user-a")).toEqual({ active: null, pending: [walk] });
    expect(await recoverWalkJournal("user-a", await loadWalkJournalState("user-a"), null)).toEqual([walk]);
  });

  it("restores journey ownership from the journal when points have no journey ID", async () => {
    const legacyWalk = { ...walk, points: walk.points.map(({ lng, lat, recordedAt }) => ({ lng, lat, recordedAt })) };
    await saveWalkJournal("user-a", [legacyWalk], legacyWalk);
    expect(await loadWalkJournalState("user-a")).toEqual({ active: walk, pending: [walk] });
  });

  it("keeps failed uploads until they are confirmed, then clears the journal", async () => {
    await saveWalkJournal("user-a", [walk], null);
    expect(await recoverWalkJournal("user-a", await loadWalkJournalState("user-a"), null)).toEqual([walk]);
    await saveWalkJournal("user-a", [], null);
    expect(await recoverWalkJournal("user-a", await loadWalkJournalState("user-a"), null)).toEqual([]);
  });

  it("ignores an unfinished walk with too few accepted points", async () => {
    await saveWalkJournal("user-a", [], { ...walk, points: walk.points.slice(0, 1) });
    expect(await recoverWalkJournal("user-a", await loadWalkJournalState("user-a"), null)).toEqual([]);
    expect(await loadWalkJournalState("user-a")).toEqual({ active: null, pending: [] });
  });
});

describe("journey completion persistence", () => {
  it("preserves recovery data and pending input when storage fails, then saves once on retry", async () => {
    await saveWalkJournal("user-a", [], walk);
    const pending: PendingWalk[] = [];
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    await expect(completeWalkJournal("user-a", pending, walk)).rejects.toThrow("Free up device storage");
    expect(pending).toEqual([]);
    expect(await loadWalkJournalState("user-a")).toEqual({ active: walk, pending: [] });
    setItem.mockRestore();
    const completed = await completeWalkJournal("user-a", pending, walk);
    expect(completed).toEqual([walk]);
    expect(await loadWalkJournalState("user-a")).toEqual({ active: null, pending: [walk] });
  });

  it("retains a short journey when clearing its journal fails", async () => {
    const shortWalk = { ...walk, points: walk.points.slice(0, 1) };
    await saveWalkJournal("user-a", [], shortWalk);
    const removeItem = vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });
    await expect(completeWalkJournal("user-a", [], shortWalk)).rejects.toThrow("retry saving");
    expect((await loadWalkJournalState("user-a")).active).toEqual(shortWalk);
    removeItem.mockRestore();
    expect(await completeWalkJournal("user-a", [], shortWalk)).toEqual([]);
    expect(await loadWalkJournalState("user-a")).toEqual({ active: null, pending: [] });
  });
});
