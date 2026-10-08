import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalAchievementDefinition } from "../achievements";
import { AchievementArtwork } from "./AchievementArtwork";

const categoryLabels: Record<PersonalAchievementDefinition["category"], string> = {
  "single-walk": "One-walk challenge",
  consistency: "Consistency challenge",
  places: "Places challenge",
};

const frontTransform =
  "translateY(0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)";
const backTransform =
  "translateY(-3px) rotateX(3deg) rotateY(180deg) rotateZ(-1deg) scale(1.025)";

function animateAchievementFlip(
  element: HTMLSpanElement,
  flipped: boolean,
): Animation | null {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  return element.animate(
    flipped
      ? [{ transform: frontTransform }, { transform: backTransform }]
      : [{ transform: backTransform }, { transform: frontTransform }],
    {
      duration: 620,
      easing: "cubic-bezier(0.16, 0.85, 0.22, 1.15)",
    },
  );
}

export function AchievementCard({
  achievement,
  earned = true,
  progress = 1,
  progressLabel = "Achievement unlocked",
  compact = false,
}: {
  achievement: PersonalAchievementDefinition;
  earned?: boolean;
  progress?: number;
  progressLabel?: string;
  compact?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const innerRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);
  const status = earned ? "Earned" : progressLabel;

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const element = innerRef.current;
    if (!element) return;
    const animation = animateAchievementFlip(element, flipped);
    return () => animation?.cancel();
  }, [flipped]);

  return (
    <button
      className={`achievement-card${earned ? " achievement-card--earned" : " achievement-card--locked"}${compact ? " achievement-card--compact" : ""}`}
      type="button"
      data-category={achievement.category}
      data-achievement={achievement.id}
      aria-pressed={flipped}
      aria-label={`${achievement.title}. ${achievement.description} ${status}. Activate to ${flipped ? "show the badge artwork" : "read the achievement details"}.`}
      onClick={() => setFlipped((current) => !current)}
    >
      <span ref={innerRef} className="achievement-card__inner" aria-hidden="true">
        <span className="achievement-card__face achievement-card__front">
          <span className="achievement-card__artwork">
            <AchievementArtwork
              image={achievement.image}
              title={achievement.title}
              size={compact ? 62 : 78}
            />
          </span>
          <strong>{achievement.title}</strong>
          <small>{status}</small>
        </span>
        <span className="achievement-card__face achievement-card__back">
          <span className="achievement-card__category">
            {categoryLabels[achievement.category]}
          </span>
          <strong>{achievement.title}</strong>
          <span className="achievement-card__description">
            {achievement.description}
          </span>
          <small>{earned ? "Achievement unlocked" : progressLabel}</small>
          {!earned && (
            <span className="achievement-card__progress">
              <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
