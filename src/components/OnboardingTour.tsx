import { useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useGuideMotion } from "../guideMotion";
import { GuideMotionButton } from "./GuideMotionButton";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { mdiGestureTap, mdiGestureSwipeUp } from "@mdi/js";
import { t, useAppTranslation, type TranslationKey } from "../i18n";
import "./OnboardingTour.css";

type Props = {
  descriptionValues: Record<string, string>;
  gesture: "tap" | "swipe" | "none";
  targetId: string;
  title: TranslationKey;
  description: TranslationKey;
  onNext: (() => void) | null;
  onDismiss: () => void;
};
type Placement = {
  borderRadius: string;
  target: { left: number; top: number; width: number; height: number };
  card: { left: number; top: number; width: number; maxHeight: number };
};

function inflateRadius(radius: string, amount: number): string {
  const value = radius.trim();
  const match = value.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!match) return value;
  const numeric = Number(match[1]);
  const unit = (match[2] || "px").toLowerCase();
  if (!Number.isFinite(numeric) || unit === "%") return value;
  return `${Math.max(0, numeric + amount)}${unit}`;
}

/** Keeps the real control usable while explaining it in a nearby, non-modal tip. */
export function OnboardingTour({ descriptionValues, gesture, targetId, title, description, onNext, onDismiss }: Props): ReactElement {
  useAppTranslation();
  const cardRef = useRef<HTMLElement>(null);
  const cardId = useId();
  const guideMotion = useGuideMotion();
  const [interacting, setInteracting] = useState(false);
  const motionEnabled = guideMotion.enabled;
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    setInteracting(false);
    const target = document.querySelector<HTMLElement>(`[data-testid="${targetId}"]`);
    const card = cardRef.current;
    if (!target || !card) throw new Error(`Cannot show Hecate walkthrough: missing target ${targetId} or tip card`);
    const outlineTarget = targetId === "journey-expand" ? target.querySelector<HTMLElement>("span") : target;
    if (!outlineTarget) throw new Error(`Cannot highlight Hecate walkthrough control: missing grabber in ${targetId}`);
    const owningDialog = target.closest('[aria-modal="true"]');
    if (owningDialog) {
      owningDialog.setAttribute("aria-owns", [owningDialog.getAttribute("aria-owns"), cardId].filter(Boolean).join(" "));
    }
    function position(): void {
      const rect = outlineTarget!.getBoundingClientRect();
      const style = getComputedStyle(outlineTarget!);
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      const above = rect.top - top - 24;
      const below = height + top - rect.bottom - 24;
      const cardHeight = card!.offsetHeight;
      const placeAbove = above >= cardHeight || above > below;
      const cardWidth = Math.min(320, width - 32);
      setPlacement({
        borderRadius: [
          inflateRadius(style.borderTopLeftRadius, 5),
          inflateRadius(style.borderTopRightRadius, 5),
          inflateRadius(style.borderBottomRightRadius, 5),
          inflateRadius(style.borderBottomLeftRadius, 5),
        ].join(" "),
        target: { left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 },
        card: {
          left: Math.max(left + 16, Math.min(rect.right - cardWidth, left + width - cardWidth - 16)),
          top: Math.max(top + 12, Math.min(top + height - cardHeight - 12, placeAbove ? rect.top - cardHeight - 16 : rect.bottom + 16)),
          width: cardWidth,
          maxHeight: Math.min(height - 24, Math.max(0, placeAbove ? above : below)),
        },
      });
    }
    let frame: number | null = null;
    let settlingTimer: number | null = null;
    function followInteraction(): void {
      position();
      frame = requestAnimationFrame(followInteraction);
    }
    function beginInteraction(): void {
      setInteracting(true);
      if (settlingTimer !== null) window.clearTimeout(settlingTimer);
      if (frame === null) followInteraction();
    }
    function endInteraction(): void {
      if (frame === null) return;
      if (settlingTimer !== null) window.clearTimeout(settlingTimer);
      // Follow the drawer through its settle animation after the finger lifts.
      settlingTimer = window.setTimeout(() => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        setInteracting(false);
        position();
      }, 500);
    }
    target.addEventListener("pointerdown", beginInteraction);
    target.addEventListener("keydown", beginInteraction);
    window.addEventListener("pointerup", endInteraction);
    window.addEventListener("pointercancel", endInteraction);
    window.addEventListener("keyup", endInteraction);
    window.addEventListener("blur", endInteraction);
    const resize = new ResizeObserver(position);
    resize.observe(target);
    if (outlineTarget !== target) resize.observe(outlineTarget);
    resize.observe(card);
    const mutation = new MutationObserver(position);
    for (let element: HTMLElement | null = target; element; element = element.parentElement) {
      mutation.observe(element, { attributes: true, attributeFilter: ["style", "class", "data-expanded"] });
    }
    window.addEventListener("animationend", position, true);
    window.addEventListener("transitionend", position, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    position();
    return () => {
      if (owningDialog) {
        const owned = (owningDialog.getAttribute("aria-owns") ?? "").split(" ").filter(id => id !== cardId).join(" ");
        if (owned) owningDialog.setAttribute("aria-owns", owned);
        else owningDialog.removeAttribute("aria-owns");
      }
      if (frame !== null) cancelAnimationFrame(frame);
      if (settlingTimer !== null) window.clearTimeout(settlingTimer);
      target.removeEventListener("pointerdown", beginInteraction);
      target.removeEventListener("keydown", beginInteraction);
      window.removeEventListener("pointerup", endInteraction);
      window.removeEventListener("pointercancel", endInteraction);
      window.removeEventListener("keyup", endInteraction);
      window.removeEventListener("blur", endInteraction);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("animationend", position, true);
      window.removeEventListener("transitionend", position, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [targetId, title, description, cardId]);

  return createPortal(<>
    {placement && <motion.div
      className="onboarding-tour-highlight"
      style={{ borderRadius: placement.borderRadius }}
      data-testid="tour-highlight"
      data-motion={motionEnabled ? "playing" : "paused"}
      data-interacting={interacting}
      initial={false}
      animate={{ ...placement.target, opacity: 1 }}
      exit={{ opacity: 0, scale: motionEnabled ? 1.12 : 1 }}
      transition={{ duration: motionEnabled && !interacting ? 0.3 : 0 }}
      aria-hidden="true"
    >
      <span className="onboarding-tour-ripple" />
      {gesture !== "none" && <span key={targetId} className={`onboarding-tour-gesture${gesture === "swipe" ? " onboarding-tour-gesture--swipe" : ""}`}>
        <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><path d={gesture === "swipe" ? mdiGestureSwipeUp : mdiGestureTap} /></svg>
      </span>}
    </motion.div>}
    <motion.aside
      ref={cardRef}
      id={cardId}
      className="onboarding-tour"
      data-testid="onboarding-tour"
      style={{ width: placement?.card.width, maxHeight: placement?.card.maxHeight, visibility: placement ? "visible" : "hidden" }}
      initial={{ opacity: 0, y: motionEnabled ? 12 : 0 }}
      animate={{ left: placement?.card.left, top: placement?.card.top, opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: motionEnabled ? -8 : 0 }}
      transition={{ duration: motionEnabled && !interacting ? 0.25 : 0 }}
      aria-label={t("Getting started")}
    >
      <motion.div key={`${title}:${description}`} aria-live="polite" aria-atomic="true"
        initial={{ opacity: motionEnabled ? 0 : 1, x: motionEnabled ? 12 : 0 }}
        animate={{ opacity: 1, x: 0 }} transition={{ duration: motionEnabled ? 0.25 : 0 }}
      >
        <div className="guide-heading">
          <h2>{t(title)}</h2>
          <GuideMotionButton controls={guideMotion} />
        </div>
        <p>{t(description, descriptionValues)}</p>
      </motion.div>
      <div className="onboarding-tour-actions">
        <motion.button type="button" data-testid="tour-dismiss" whileTap={{ scale: motionEnabled ? 0.94 : 1 }} onClick={onDismiss}>{t("Skip tour")}</motion.button>
        {onNext && <motion.button type="button" data-testid="tour-next" whileTap={{ scale: motionEnabled ? 0.94 : 1 }} onClick={onNext}>{t("Next")}</motion.button>}
      </div>
    </motion.aside>
  </>, document.body);
}
