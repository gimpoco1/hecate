import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const STORAGE_KEY = "hecate.onboarding-motion.v1";
const CHANGE_EVENT = "hecate:guide-motion-change";
export type GuideMotion = {
  enabled: boolean;
  paused: boolean;
  reducedMotion: boolean;
  toggle: () => void;
};

export function resetGuideMotion(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useGuideMotion(): GuideMotion {
  const reducedMotion = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(() => localStorage.getItem(STORAGE_KEY) === "paused");
  useEffect(() => {
    const refresh = (): void => setPaused(localStorage.getItem(STORAGE_KEY) === "paused");
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  function toggle(): void {
    localStorage.setItem(STORAGE_KEY, paused ? "playing" : "paused");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return { enabled: !paused && !reducedMotion, paused, reducedMotion, toggle };
}
