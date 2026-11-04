import { resetContextualGuides } from "./contextualGuides";
import { useCallback, useEffect, useState } from "react";

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

export function resetOnboardingTour(): void {
  localStorage.removeItem(STORAGE_KEY);
  resetContextualGuides();
}

export function useOnboardingTour(): {
  step: TourStep;
  advance: (completed: TourStep) => void;
  dismiss: () => void;
  restart: () => void;
} {
  const [step, setStep] = useState<TourStep>(() => parseTourStep(localStorage.getItem(STORAGE_KEY)));
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, step);
  }, [step]);
  const advance = useCallback((completed: TourStep): void => {
    setStep(current => nextTourStep(current, completed));
  }, []);
  return { step, advance, dismiss: () => setStep("done"), restart: () => { resetOnboardingTour(); setStep("start"); } };
}
