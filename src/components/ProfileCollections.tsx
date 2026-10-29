import { mdiCubeOutline, mdiDotsVertical, mdiMapMarkerOutline } from "@mdi/js";
import { formatDiscoveryPercentage } from "../cityProgressFormat";
import { formatNumber, t, useAppTranslation } from "../i18n";
import { personalAchievementDefinition, type AchievementEvaluation } from "../achievements";
import {
  CITY_MILESTONE_TIERS,
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
  onKeepsake: (city: CityBoundary, discoveredKm: number, percentage: number) => void;
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
  return `${formatNumber(distance, distance >= 10 ? 1 : 2)} km`;
}


export function CitiesSheet({
  open,
  loading,
  cityProgresses,
  onCitySelect,
  onKeepsake,
  onBack,
  onClose,
}: CitiesSheetProps) {
  useAppTranslation();
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
        onPointerDownCapture={event => {
          if (event.target instanceof Element && !event.target.closest(".cities-collection-list__actions")) {
            event.currentTarget.querySelectorAll<HTMLDetailsElement>(".cities-collection-list__actions[open]").forEach(menu => { menu.open = false; });
          }
        }}
      >
        <button
          className="icon-button walking-stats-back"
          type="button"
          onClick={onBack}
          aria-label={t("Back to profile")}
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label={t("Close cities explored")}
        >
          <XIcon />
        </button>
        <div className="eyebrow">{t("Your map")}</div>
        <h2 id="cities-sheet-title">{t("Cities explored")}</h2>
        <p>{t("Use a city’s menu to find it on the map or view its artwork.")}</p>

        <section className="profile-collection-summary" aria-label={t("Cities summary")}>
          <span>
            <strong>{cityProgresses.length}</strong>
            <small>{t("cityLabel", { count: cityProgresses.length })}</small>
          </span>
          <span>
            <strong>{formatDistance(totalDistance)}</strong>
            <small>{t("New ground in cities")}</small>
          </span>
        </section>

        {loading && cityProgresses.length === 0 ? (
          <p className="profile-collection-empty">{t("Finding past cities…")}</p>
        ) : cityProgresses.length === 0 ? (
          <p className="profile-collection-empty">{t("Start a walk to add your first city.")}</p>
        ) : (
          <ul className="cities-collection-list">
            {cityProgresses.map(({ city, percentage, distance }) => {
              const earned = earnedCityMilestones(city.id, city.name, distance);
              const next = cityMilestoneProgress(distance).next;
              return (
                <li key={city.id}>
                  <div className="cities-collection-list__overview" data-testid={`city-info-${city.id}`}>
                    <span className="cities-collection-list__identity">
                      <strong>{city.name}</strong>
                      <small>
                        {next
                          ? `${formatDistance(distance)} / ${formatDistance(next.thresholdKm)} · ${next.title}`
                          : t("{{value0}} · all 3 stars earned", { value0: CITY_MILESTONE_TIERS[CITY_MILESTONE_TIERS.length - 1].title })}
                      </small>
                    </span>
                    <span className="cities-collection-list__metrics">
                      <CityLevelStars level={earned.length} />
                      <strong>{formatDiscoveryPercentage(percentage)}</strong>
                    </span>
                  </div>
                  <details className="cities-collection-list__actions" name="city-actions">
                    <summary data-testid={`city-actions-${city.id}`} aria-label={t("Actions for {{city}}", { city: city.name })} title={t("City actions")}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiDotsVertical} /></svg>
                    </summary>
                    <div>
                      <button type="button" data-testid={`city-map-${city.id}`}
                        aria-label={t("Go to {{city}}", { city: city.name })}
                        onClick={() => onCitySelect(city)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiMapMarkerOutline} /></svg>
                        {t("Go to city")}
                      </button>
                      <button type="button" data-testid={`city-keepsake-${city.id}`}
                        aria-label={t("View artwork for {{city}}", { city: city.name })}
                        onClick={() => onKeepsake(city, distance, percentage)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiCubeOutline} /></svg>
                        {t("View artwork")}
                      </button>
                    </div>
                  </details>
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
  useAppTranslation();
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
          aria-label={t("Back to profile")}
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label={t("Close achievements")}
        >
          <XIcon />
        </button>
        <div className="eyebrow">{t("Your progress")}</div>
        <h2 id="achievements-sheet-title">{t("Achievements")}</h2>
        <p>{t("Challenges earned through your recorded journeys and discoveries.")}</p>

        <section
          className="profile-collection-summary"
          aria-label={t("Achievements summary")}
        >
          <span>
            <strong>{earnedCount}</strong>
            <small>{t("Earned")}</small>
          </span>
          <span>
            <strong>{achievementEvaluations.length - earnedCount}</strong>
            <small>{t("Still to unlock")}</small>
          </span>
        </section>

        <ul className="achievements-collection-list">
          {achievementEvaluations.map(
            ({ definition, earned, progress, progressText }) => (
              <li key={definition.id}>
                <AchievementCard
                  achievement={personalAchievementDefinition(definition.id)}
                  earned={earned}
                  progress={progress}
                  progressLabel={t(progressText.key, progressText.values)}
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
