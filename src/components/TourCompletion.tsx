import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useGuideMotion } from "../guideMotion";
import { t, useAppTranslation } from "../i18n";
import { CompassIcon } from "./Icons";
import "./OnboardingTour.css";
import "./TourCompletion.css";

export function TourCompletion({ onClose }: { onClose: () => void }) {
  useAppTranslation();
  const controls = useGuideMotion();
  return createPortal(<div className="onboarding-tour-finish">
    <motion.aside className="onboarding-tour onboarding-tour-complete" data-testid="tour-completion"
      aria-labelledby="tour-completion-title" initial={{ opacity: 0, y: controls.enabled ? 12 : 0 }}
      animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: controls.enabled ? .25 : 0 }}>
      <div className="onboarding-tour-complete-art" aria-hidden="true">
        <svg viewBox="0 0 192 104" fill="none">
          <path d="M20 82h32c32 0 0-44 32-44h56" stroke="currentColor" strokeWidth="14" strokeLinecap="round" opacity=".08" />
          <motion.path d="M20 82h32c32 0 0-44 32-44h56" stroke="var(--lime)" strokeWidth="7" strokeLinecap="round"
            initial={{ pathLength: controls.enabled ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: controls.enabled ? .9 : 0, delay: controls.enabled ? .15 : 0 }} />
          <circle cx="20" cy="82" r="6" fill="currentColor" />
          <circle cx="20" cy="82" r="2" fill="var(--paper)" />
        </svg>
        <span className="onboarding-tour-complete-icon"><CompassIcon size={32} /></span>
      </div>
      <div role="status">
        <h2 id="tour-completion-title">{t("You're ready to go!")}</h2>
        <p>{t("Keep exploring with Hecate.")}</p>
      </div>
      <button type="button" className="onboarding-tour-complete-button" data-testid="tour-completion-close" onClick={onClose} autoFocus>
        {t("Let's go!")}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
    </motion.aside>
  </div>, document.body);
}
