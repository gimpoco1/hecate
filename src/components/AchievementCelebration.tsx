import type { PersonalAchievementDefinition } from "../achievements";
import { AchievementArtwork } from "./AchievementArtwork";

export function AchievementCelebration({
  achievement,
  remaining,
  onDismiss,
}: {
  achievement: PersonalAchievementDefinition;
  remaining: number;
  onDismiss: () => void;
}) {
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
        <div className="achievement-celebration__eyebrow">
          Achievement unlocked
        </div>
        <div className="achievement-celebration__artwork">
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
        <button type="button" onClick={onDismiss} autoFocus>
          {remaining > 0 ? "Celebrate the next one" : "Keep exploring"}
        </button>
        {remaining > 0 && (
          <small>
            {remaining} more new {remaining === 1 ? "achievement" : "achievements"}
          </small>
        )}
      </section>
    </div>
  );
}
