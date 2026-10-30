import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect, useRef } from "react";
import { errorDiagnostic } from "./diagnostics";

interface NavigationScreenPlugin {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
}

const NavigationScreen = registerPlugin<NavigationScreenPlugin>("NavigationScreen");

/** Serialize screen ownership so a late start cannot outlive navigation cleanup. */
export function useNavigationScreen(active: boolean): void {
  const pending = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    pending.current = pending.current.then(() =>
      active ? NavigationScreen.keepAwake() : NavigationScreen.allowSleep(),
    ).catch(error => {
      console.error("Could not update navigation screen auto-lock", { active, ...errorDiagnostic(error) });
    });
    if (!active) return;
    return () => {
      pending.current = pending.current.then(() => NavigationScreen.allowSleep()).catch(error => {
        console.error("Could not restore screen auto-lock after navigation", errorDiagnostic(error));
      });
    };
  }, [active]);
}
