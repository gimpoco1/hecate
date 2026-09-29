import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATIC_UPDATES_KEY,
  AUTOMATIC_UPDATE_PENDING_EVENT,
  isAutomaticUpdatePending,
  isAutomaticUpdatesEnabled,
  setAutomaticUpdatePending,
  setAutomaticUpdatesEnabled,
} from "./automaticUpdates";

function installStorageMock() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

describe("automaticUpdates", () => {
  beforeEach(() => {
    installStorageMock();
  });

  it("defaults to enabled unless the user explicitly turns it off", () => {
    expect(isAutomaticUpdatesEnabled()).toBe(true);
    expect(globalThis.localStorage.getItem(AUTOMATIC_UPDATES_KEY)).toBeNull();

    setAutomaticUpdatesEnabled(false);
    expect(isAutomaticUpdatesEnabled()).toBe(false);
    expect(globalThis.localStorage.getItem(AUTOMATIC_UPDATES_KEY)).toBe(
      "false",
    );

    setAutomaticUpdatesEnabled(true);
    expect(isAutomaticUpdatesEnabled()).toBe(true);
    expect(globalThis.localStorage.getItem(AUTOMATIC_UPDATES_KEY)).toBe("true");
  });

  it("tracks pending leaderboard retries independently for each account", () => {
    const events = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      value: events,
      configurable: true,
      writable: true,
    });
    const notified = vi.fn();
    events.addEventListener(AUTOMATIC_UPDATE_PENDING_EVENT, notified);
    expect(isAutomaticUpdatePending("user-a")).toBe(false);

    setAutomaticUpdatePending("user-a", true);
    expect(isAutomaticUpdatePending("user-a")).toBe(true);
    expect(isAutomaticUpdatePending("user-b")).toBe(false);
    expect(notified).toHaveBeenCalledOnce();

    setAutomaticUpdatePending("user-a", false);
    expect(isAutomaticUpdatePending("user-a")).toBe(false);
  });
});
