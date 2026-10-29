import { t } from "./i18n";
import { errorDiagnostic } from "./diagnostics";
import { useSyncExternalStore } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { Keyboard, KeyboardStyle } from "@capacitor/keyboard";

export type AppearancePreference = "system" | "light" | "dark";
export type ColorTheme = "light" | "dark";
type Appearance = { preference: AppearancePreference; theme: ColorTheme };
const STORAGE_KEY = "hecate.appearance.v1";
const listeners = new Set<() => void>();
let snapshot: Appearance = { preference: "system", theme: "light" };
let initialized = false;

export function parseAppearancePreference(value: string | null): AppearancePreference {
  if (value === null || value === "system") return "system";
  if (value === "light" || value === "dark") return value;
  throw new TypeError(t("Invalid saved appearance preference: {{value0}}", { value0: value }));
}

export function resolveColorTheme(preference: AppearancePreference, systemDark: boolean): ColorTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function applyAppearance(preference: AppearancePreference): void {
  const theme = resolveColorTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches);
  snapshot = { preference, theme };
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151f27" : "#f7f4ed");
  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
      .catch((error) => console.error("Could not update system bar appearance", { theme, error: errorDiagnostic(error) }));
    if (Capacitor.getPlatform() === "ios") {
      void Keyboard.setStyle({ style: theme === "dark" ? KeyboardStyle.Dark : KeyboardStyle.Light })
        .catch((error) => console.error("Could not update keyboard appearance", { theme, error: errorDiagnostic(error) }));
    }
  }
  listeners.forEach((listener) => listener());
}

/** Apply before the first React render; theme changes never recreate the map or recording state. */
export function initializeAppearance(): void {
  if (initialized) return;
  initialized = true;
  applyAppearance(parseAppearancePreference(localStorage.getItem(STORAGE_KEY)));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (snapshot.preference === "system") applyAppearance("system");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      applyAppearance(parseAppearancePreference(localStorage.getItem(STORAGE_KEY)));
    }
  });
}

export function setAppearancePreference(preference: AppearancePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
  applyAppearance(preference);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getSnapshot(): Appearance { return snapshot; }
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getSnapshot);
}
