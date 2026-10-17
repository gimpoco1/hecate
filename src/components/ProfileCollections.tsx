import type { AchievementEvaluation } from "../achievements";
import {
  cityMilestoneProgress,
  earnedCityMilestones,
} from "../badges";
import type { CityBoundary } from "../city";
import { AchievementCard } from "./AchievementCard";
import { CityLevelStars } from "./CityLevelStars";
import { ArrowLeftIcon, XIcon } from "./Icons";

export type ExploredCityProgress = {
  city: CityBoundary;
  percentage: number;
  distance: number;
};

type CitiesSheetProps = {
  open: boolean;
  loading: boolean;
  cityProgresses: ExploredCityProgress[];
  onCitySelect: (city: CityBoundary) => void;
  onBack: () => void;
  onClose: () => void;
};

type AchievementsSheetProps = {
  open: boolean;
  achievementEvaluations: AchievementEvaluation[];
  onBack: () => void;
  onClose: () => void;
};

function formatDistance(distance: number): string {
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(distance >= 10 ? 1 : 2)} km`;
}

function formatDiscoveryPercentage(percentage: number): string {
  if (percentage > 0 && percentage < 0.1) return "<0.1%";
  if (percentage < 10) return `${percentage.toFixed(1)}%`;
  return `${Math.round(percentage)}%`;
}

export function CitiesSheet({
  open,
  loading,
  cityProgresses,
  onCitySelect,
  onBack,
  onClose,
}: CitiesSheetProps) {
  if (!open) return null;
  const totalDistance = cityProgresses.reduce(
    (total, progress) => total + progress.distance,
    0,
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet profile-collection-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-labelledby="cities-sheet-title"
      >
        <button
          className="icon-button walking-stats-back"
          type="button"
          onClick={onBack}
          aria-label="Back to profile"
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label="Close cities explored"
        >
          <XIcon />
        </button>
        <div className="eyebrow">Your map</div>
        <h2 id="cities-sheet-title">Cities explored</h2>
        <p>Choose a city to see your discoveries there on the map.</p>

        <section className="profile-collection-summary" aria-label="Cities summary">
          <span>
            <strong>{cityProgresses.length}</strong>
            <small>{cityProgresses.length === 1 ? "City" : "Cities"}</small>
          </span>
          <span>
            <strong>{formatDistance(totalDistance)}</strong>
            <small>New ground in cities</small>
          </span>
        </section>

        {loading && cityProgresses.length === 0 ? (
          <p className="profile-collection-empty">Finding past cities…</p>
        ) : cityProgresses.length === 0 ? (
          <p className="profile-collection-empty">
            Start a walk to add your first city.
          </p>
        ) : (
          <ul className="cities-collection-list">
            {cityProgresses.map(({ city, percentage, distance }) => {
              const earned = earnedCityMilestones(city.id, city.name, distance);
              const next = cityMilestoneProgress(distance).next;
              return (
                <li key={city.id}>
                  <button type="button" onClick={() => onCitySelect(city)}>
                    <span className="cities-collection-list__identity">
                      <strong>{city.name}</strong>
                      <small>
                        {next
                          ? `${formatDistance(distance)} / ${formatDistance(next.thresholdKm)} · ${next.title}`
                          : `${earned.at(-1)?.title} · all 3 stars earned`}
                      </small>
                    </span>
                    <span className="cities-collection-list__metrics">
                      <CityLevelStars level={earned.length} />
                      <strong>{formatDiscoveryPercentage(percentage)}</strong>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AchievementsSheet({
  open,
  achievementEvaluations,
  onBack,
  onClose,
}: AchievementsSheetProps) {
  if (!open) return null;
  const earnedCount = achievementEvaluations.filter(
    ({ earned }) => earned,
  ).length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet profile-collection-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-labelledby="achievements-sheet-title"
      >
        <button
          className="icon-button walking-stats-back"
          type="button"
          onClick={onBack}
          aria-label="Back to profile"
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label="Close achievements"
        >
          <XIcon />
        </button>
        <div className="eyebrow">Your progress</div>
        <h2 id="achievements-sheet-title">Achievements</h2>
        <p>Challenges earned through your recorded journeys and discoveries.</p>

        <section
          className="profile-collection-summary"
          aria-label="Achievements summary"
        >
          <span>
            <strong>{earnedCount}</strong>
            <small>Earned</small>
          </span>
          <span>
            <strong>{achievementEvaluations.length - earnedCount}</strong>
            <small>Still to unlock</small>
          </span>
        </section>

        <ul className="achievements-collection-list">
          {achievementEvaluations.map(
            ({ definition, earned, progress, progressLabel }) => (
              <li key={definition.id}>
                <AchievementCard
                  achievement={definition}
                  earned={earned}
                  progress={progress}
                  progressLabel={progressLabel}
                  compact
                />
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
