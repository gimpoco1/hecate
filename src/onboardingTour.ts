import { resetContextualGuides } from "./contextualGuides";
import { useEffect, useRef, useState } from "react";
import { persistentStorage } from "./persistentStorage";

export const TOUR_STEPS = ["start", "stats", "navigation", "save", "city", "profile", "done"] as const;
export type TourStep = typeof TOUR_STEPS[number] | "finished";
const STORAGE_KEY = "hecate.onboarding-tour.v1";

export function parseTourStep(value: string | null): TourStep {
  if (value === null) return "start";
  if (value === "finished") return "finished";
  const step = TOUR_STEPS.find(step => step === value);
  if (!step) throw new TypeError(`Invalid Hecate walkthrough step: ${value}`);
  return step;
}

export function nextTourStep(current: TourStep, completed: TourStep): TourStep {
  if (current !== completed || current === "done") return current;
  if (current === "profile") return "finished";
  if (current === "finished") return "done";
  return TOUR_STEPS[TOUR_STEPS.indexOf(current) + 1];
}

export async function resetOnboardingTour(): Promise<void> {
  await persistentStorage.setItem(STORAGE_KEY, "start");
  resetContextualGuides();
}

export function useOnboardingTour(reportError: (message: string) => void): {
  step: TourStep | null;
  advance: (completed: TourStep) => void;
  dismiss: () => void;
  restart: () => void;
} {
  const [step, setStep] = useState<TourStep | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    void persistentStorage.getItem(STORAGE_KEY).then(value => {
      if (active) setStep(parseTourStep(value));
    }).catch((error: Error) => {
      if (active) reportError(`Could not load walkthrough progress. Reopen Hecate to retry. ${error.message}`);
    });
    return () => { active = false; };
  }, [reportError]);

  async function save(next: TourStep): Promise<void> {
    if (saving.current) return;
    saving.current = true;
    try {
      await persistentStorage.setItem(STORAGE_KEY, next);
      setStep(next);
    } catch (error) {
      reportError(`Could not save walkthrough progress. Check device storage and try again. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      saving.current = false;
    }
  }

  return {
    step,
    advance: completed => { if (step !== null && step === completed) void save(nextTourStep(step, completed)); },
    dismiss: () => { void save("done"); },
    restart: () => {
      resetContextualGuides();
      void save("start");
    },
  };
}
