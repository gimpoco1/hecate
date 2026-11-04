import { mdiPause, mdiPlay } from "@mdi/js";
import { t } from "../i18n";
import type { GuideMotion } from "../guideMotion";
import "./GuideMotionButton.css";

export function GuideMotionButton({ controls }: { controls: GuideMotion }) {
  if (controls.reducedMotion) return null;
  const label = controls.paused ? t("Resume animations") : t("Pause animations");
  return <button type="button" className="guide-motion-button" data-testid="tour-motion"
    aria-label={label} title={label} onClick={controls.toggle}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={controls.paused ? mdiPlay : mdiPause} /></svg>
  </button>;
}
