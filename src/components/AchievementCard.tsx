import { mdiRotate360 } from "@mdi/js";
import { MAP_REWARDS, type MapReward } from "../goalRewards";
import { t, useAppTranslation } from "../i18n";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalAchievementDefinition } from "../achievements";
import { MapRewardArtwork } from "./MapRewardCard";
import { AchievementArtwork } from "./AchievementArtwork";

const categoryLabels: Record<PersonalAchievementDefinition["category"], "One-walk challenge" | "Consistency challenge" | "Places challenge"> = {
  "single-walk": "One-walk challenge",
  consistency: "Consistency challenge",
  places: "Places challenge",
};

type MapAchievementReward = { id: MapReward; title: string; unlocked: boolean; onOpen: (reward: MapReward) => void };

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
  initialFace,
  mapReward,
  earned = true,
  progress = 1,
  progressLabel = t("Achievement unlocked"),
  compact = false,
}: {
  achievement: PersonalAchievementDefinition;
  initialFace?: "artwork" | "details";
  mapReward?: MapAchievementReward;
  earned?: boolean;
  progress?: number;
  progressLabel?: string;
  compact?: boolean;
}) {
  useAppTranslation();
  const [flipped, setFlipped] = useState(initialFace === "details");
  const innerRef = useRef<HTMLSpanElement>(null);
  const mountedRef = useRef(false);
  const status = earned ? t("achievement.earned") : progressLabel;

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
    <div
      className={`achievement-card${earned ? " achievement-card--earned" : " achievement-card--locked"}${compact ? " achievement-card--compact" : ""}${mapReward ? " achievement-card--map-reward" : ""}`}
      role="group"
      data-category={achievement.category}
      data-achievement={achievement.id}
      data-flipped={flipped}
      aria-label={t("achievement.cardLabel", { title: achievement.title, description: achievement.description, status, action: t(flipped ? "achievement.showArtwork" : "achievement.readDetails") })}
    >
      <span ref={innerRef} className="achievement-card__inner">
        <span className="achievement-card__face achievement-card__front" aria-hidden={flipped} inert={flipped}>
          <span className="achievement-card__artwork">
            <AchievementArtwork
              image={achievement.image}
              title={achievement.title}
              size={compact ? 62 : 78}
            />
          </span>
          <strong>{achievement.title}</strong>
          <small>{status}</small>
          <button type="button" className="achievement-card__flip" data-testid={`achievement-flip-${achievement.id}-artwork`} aria-pressed={flipped} aria-label={t("achievement.cardLabel", { title: achievement.title, description: achievement.description, status, action: t(flipped ? "achievement.showArtwork" : "achievement.readDetails") })} onClick={() => setFlipped(current => !current)}><AchievementRotateIcon /></button>
        </span>
        <span className="achievement-card__face achievement-card__back" aria-hidden={!flipped} inert={!flipped}>
          <span className="achievement-card__category">
            {t(categoryLabels[achievement.category])}
          </span>
          <strong>{achievement.title}</strong>
          <span className="achievement-card__description">
            {achievement.description}
          </span>
          <small>{earned ? t("Achievement unlocked") : progressLabel}</small>
          {!earned && (
            <span className="achievement-card__progress">
              <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
            </span>
          )}
          <button type="button" className="achievement-card__flip" data-testid={`achievement-flip-${achievement.id}-details`} aria-pressed={flipped} aria-label={t("achievement.cardLabel", { title: achievement.title, description: achievement.description, status, action: t(flipped ? "achievement.showArtwork" : "achievement.readDetails") })} onClick={() => setFlipped(current => !current)}><AchievementRotateIcon /></button>
          {mapReward && <AchievementRewardAction reward={mapReward} face="details" />}
        </span>
      </span>
    </div>
  );
}

function AchievementRewardAction({ reward, face }: { reward: MapAchievementReward; face: "artwork" | "details" }) {
  const definition = MAP_REWARDS.find(item => item.id === reward.id);
  return <button type="button" className="achievement-card__map-reward" data-unlocked={reward.unlocked} data-testid={`achievement-reward-${reward.id}-${face}`} onClick={() => reward.onOpen(reward.id)}>
    {definition && <span className="achievement-card__reward-thumbnail"><MapRewardArtwork reward={definition} /></span>}
    <span>{t(reward.unlocked ? "{{value0}} unlocked!" : "Unlocks {{value0}}", { value0: reward.title })}</span>
    <span aria-hidden="true">›</span>
  </button>;
}

function AchievementRotateIcon() {
  return <svg className="achievement-card__rotate-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={mdiRotate360} />
  </svg>;
}
