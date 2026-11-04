import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useAppTranslation } from "../i18n";
import { CONTEXTUAL_GUIDES, CONTEXTUAL_GUIDE_RESET_EVENT, contextualGuideDismissed, contextualGuideStorageKey, type ContextualGuideId } from "../contextualGuides";
import { OnboardingTour } from "./OnboardingTour";

/** Introduces a feature where it is used; acknowledging it persists across launches. */
export function ContextualGuide({ topic }: { topic: ContextualGuideId }) {
  useAppTranslation();
  const [dismissed, setDismissed] = useState(() => contextualGuideDismissed(localStorage.getItem(contextualGuideStorageKey(topic))));
  useEffect(() => {
    const reset = (): void => setDismissed(false);
    window.addEventListener(CONTEXTUAL_GUIDE_RESET_EVENT, reset);
    return () => window.removeEventListener(CONTEXTUAL_GUIDE_RESET_EVENT, reset);
  }, []);
  useLayoutEffect(() => {
    if (dismissed) return;
    const targetId = `guide-${topic}`;
    const target = document.querySelector<HTMLElement>(`[data-testid="${targetId}"]`);
    if (!target) throw new Error(`Cannot reveal Hecate guide target: ${targetId}`);
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }, [topic, dismissed]);

  function dismiss(): void {
    localStorage.setItem(contextualGuideStorageKey(topic), "dismissed");
    setDismissed(true);
  }
  const guide = CONTEXTUAL_GUIDES[topic];
  return <AnimatePresence>{!dismissed && <OnboardingTour
    targetId={`guide-${topic}`}
    title={guide.title}
    description={guide.description}
    descriptionValues={{}}
    gesture="none"
    onNext={dismiss}
    onDismiss={dismiss}
  />}</AnimatePresence>;
}
