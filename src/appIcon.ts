import { registerPlugin } from "@capacitor/core";

export type AppIconChoice = "original" | "dark";
export type AppIconState = { supported: boolean; icon: AppIconChoice };
interface AppIconPlugin {
  getState(): Promise<AppIconState>;
  setIcon(options: { icon: AppIconChoice }): Promise<AppIconState>;
}
export const AppIcon = registerPlugin<AppIconPlugin>("AppIcon");

export function parseAppIconState(value: unknown): AppIconState {
  if (!value || typeof value !== "object") throw new TypeError("The device returned an invalid app icon state.");
  const state = value as Partial<AppIconState>;
  if (typeof state.supported !== "boolean" || (state.icon !== "original" && state.icon !== "dark")) {
    throw new TypeError("The device returned an unrecognized app icon or support status.");
  }
  return { supported: state.supported, icon: state.icon };
}
