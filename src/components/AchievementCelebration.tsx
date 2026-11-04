import { ContextualGuide } from "./ContextualGuide";
import { useState } from "react";
import { MapRewardPreview } from "./MapRewardPreview";
import { MAP_REWARDS, type MapReward } from "../goalRewards";
import { t, useAppTranslation } from "../i18n";
import type { PersonalAchievementDefinition } from "../achievements";
import { AchievementArtwork } from "./AchievementArtwork";

export function AchievementCelebration({
  achievement,
  remaining,
  onDismiss,
  onSelectMapReward,
  onViewMapReward,
}: {
  achievement: PersonalAchievementDefinition;
  remaining: number;
  onSelectMapReward: (reward: MapReward) => void;
  onViewMapReward: (reward: MapReward) => void;
  onDismiss: () => void;
}) {
  useAppTranslation();
  const [showMap, setShowMap] = useState(false);
  const reward = MAP_REWARDS.find(item => item.goal === achievement.id);
  if (showMap && reward) return <div className="achievement-celebration-backdrop" role="presentation">
    <section className="achievement-celebration map-reward-reveal" role="dialog" aria-modal="true" aria-labelledby="map-reward-reveal-title" data-testid="map-reward-reveal">
      <div className="achievement-celebration__eyebrow">{t("Map appearances")}</div>
      <h2 id="map-reward-reveal-title">{t("{{value0}} unlocked!", { value0: t(reward.title) })}</h2>
      <MapRewardPreview reward={reward} />
      <button type="button" data-testid="reveal-select" autoFocus onClick={() => { onSelectMapReward(reward.id); onDismiss(); }}>{t("Select")}</button>
      <button type="button" className="map-reward-reveal__later" data-testid="reveal-later" onClick={onDismiss}>{t("Maybe later")}</button>
    </section>
  </div>;

  return (
    <div className="achievement-celebration-backdrop" role="presentation">
      <section
        className="achievement-celebration"
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-celebration-title"
        aria-describedby="achievement-celebration-description"
      >
        <div className="achievement-celebration__burst" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className="achievement-celebration__eyebrow">{t("Achievement unlocked")}</div>
        <div className="achievement-celebration__artwork" data-testid="guide-unlock">
          <AchievementArtwork
            image={achievement.image}
            title={achievement.title}
            size={132}
          />
        </div>
        <h2 id="achievement-celebration-title">{achievement.title}</h2>
        <p id="achievement-celebration-description">
          {achievement.description}
        </p>
        <ContextualGuide topic="unlock" />
        <button type="button" data-testid="achievement-celebration-dismiss" onClick={() => {
          if (reward) {
            onViewMapReward(reward.id);
            setShowMap(true);
          } else onDismiss();
        }} autoFocus>
          {reward ? t("Reveal map") : remaining > 0 ? t("Celebrate the next one") : t("Keep exploring")}
        </button>
        {remaining > 0 && (
          <small>{t("moreAchievements", { count: remaining })}</small>
        )}
      </section>
    </div>
  );
}
