import { Capacitor, registerPlugin } from "@capacitor/core";

interface PersistentStoragePlugin {
  read(options: { key: string }): Promise<{ value: string | null }>;
  write(options: { key: string; value: string | null }): Promise<void>;
}

const nativeStorage = registerPlugin<PersistentStoragePlugin>("PersistentStorage");
const operations = new Map<string, Promise<void>>();

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (operations.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  operations.set(key, settled);
  void settled.then(() => {
    if (operations.get(key) === settled) operations.delete(key);
  });
  return result;
}

export const persistentStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return localStorage.getItem(key);
    return serialize(key, async () => {
      const { value } = await nativeStorage.read({ key });
      if (value !== null) return value;
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        await nativeStorage.write({ key, value: legacy });
        localStorage.removeItem(key);
      }
      return legacy;
    });
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.setItem(key, value);
      return;
    }
    return serialize(key, async () => {
      await nativeStorage.write({ key, value });
      localStorage.removeItem(key);
    });
  },
  async removeItem(key: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.removeItem(key);
      return;
    }
    return serialize(key, async () => {
      localStorage.removeItem(key);
      await nativeStorage.write({ key, value: null });
    });
  },
};
