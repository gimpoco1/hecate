import { useState } from "react";
import type { PersonalAchievementDefinition } from "../achievements";
import { AchievementArtwork } from "./AchievementArtwork";

const categoryLabels: Record<PersonalAchievementDefinition["category"], string> = {
  "single-walk": "Single-walk achievement",
  consistency: "Consistency achievement",
  places: "Places achievement",
};

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
  const status = earned ? "Earned" : progressLabel;

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
      <span className="achievement-card__inner" aria-hidden="true">
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
