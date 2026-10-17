import { useState } from "react";
import { CITY_MILESTONE_TIERS } from "../badges";
import { AchievementArtwork } from "./AchievementArtwork";
import { CityLevelStars } from "./CityLevelStars";
import { InfoIcon } from "./Icons";

export type CityMilestoneProgress = {
  cityId: string;
  cityName: string;
  discoveredKm: number;
};

type Props = {
  progress: CityMilestoneProgress;
};

export const JOURNEY_CITY_MILESTONES_TITLE_ID = "journey-city-milestones-title";
const JOURNEY_CITY_MILESTONES_EXPLANATION_ID =
  "journey-city-milestones-explanation";

export function CityMilestones({ progress }: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const earnedCount = CITY_MILESTONE_TIERS.filter(
    (tier) => progress.discoveredKm >= tier.thresholdKm,
  ).length;

  return (
    <section
      className="account-milestones"
      aria-labelledby={JOURNEY_CITY_MILESTONES_TITLE_ID}
    >
      <div className="account-milestones__heading">
        <span>
          <span className="account-milestones__title-row">
            <strong id={JOURNEY_CITY_MILESTONES_TITLE_ID}>
              City milestones
            </strong>
            <button
              type="button"
              className="account-milestones__info-button"
              aria-label="Why these city milestones are shown"
              aria-expanded={infoOpen}
              aria-controls={JOURNEY_CITY_MILESTONES_EXPLANATION_ID}
              onClick={() => setInfoOpen((current) => !current)}
            >
              <InfoIcon size={15} strokeWidth={1.9} />
            </button>
          </span>
          <small>Your progress in {progress.cityName}</small>
        </span>
        <small>
          {earnedCount} / {CITY_MILESTONE_TIERS.length} earned
        </small>
      </div>
      {infoOpen && (
        <p
          className="account-milestones__explanation"
          id={JOURNEY_CITY_MILESTONES_EXPLANATION_ID}
          role="note"
        >
          These milestones follow the city currently shown on your map and
          update when that city changes.
        </p>
      )}
      <div className="account-milestones__list">
        {CITY_MILESTONE_TIERS.map((milestone) => {
          const earned = progress.discoveredKm >= milestone.thresholdKm;
          const remainingKm = Math.max(
            0,
            milestone.thresholdKm - progress.discoveredKm,
          );
          return (
            <article
              className={`account-milestone${earned ? "" : " account-milestone--locked"}`}
              key={milestone.id}
              aria-label={
                earned
                  ? `${milestone.title} earned in ${progress.cityName}`
                  : `${milestone.title} requires ${milestone.thresholdKm} kilometers in ${progress.cityName}. ${remainingKm.toFixed(1)} kilometers remaining.`
              }
            >
              <AchievementArtwork
                image={milestone.image}
                title={milestone.title}
                size={42}
              />
              <strong>{milestone.title}</strong>
              {earned ? (
                <span className="account-milestone__goal">
                  Earned at {milestone.thresholdKm} km
                </span>
              ) : (
                <span className="account-milestone__goal">
                  <strong>
                    {progress.discoveredKm.toFixed(1)} / {milestone.thresholdKm}{" "}
                    km
                  </strong>
                  <small>{remainingKm.toFixed(1)} km left</small>
                </span>
              )}
              <CityLevelStars level={milestone.level} decorative />
            </article>
          );
        })}
      </div>
    </section>
  );
}
