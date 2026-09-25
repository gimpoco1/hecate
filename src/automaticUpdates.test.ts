import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTOMATIC_UPDATES_KEY,
  isAutomaticUpdatesEnabled,
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
});
