import { formatNumber, t, useAppTranslation } from "../i18n";
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
  useAppTranslation();
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
            <strong id={JOURNEY_CITY_MILESTONES_TITLE_ID}>{t("City milestones")}</strong>
            <button
              type="button"
              className="account-milestones__info-button"
              aria-label={t("Why these city milestones are shown")}
              aria-expanded={infoOpen}
              aria-controls={JOURNEY_CITY_MILESTONES_EXPLANATION_ID}
              onClick={() => setInfoOpen((current) => !current)}
            >
              <InfoIcon size={15} strokeWidth={1.9} />
            </button>
          </span>
          <small>{t("Your progress in {{value0}}", { value0: progress.cityName })}</small>
        </span>
        <small>{t("{{value0}} / {{value1}} earned", { value0: earnedCount, value1: CITY_MILESTONE_TIERS.length })}</small>
      </div>
      {infoOpen && (
        <p
          className="account-milestones__explanation"
          id={JOURNEY_CITY_MILESTONES_EXPLANATION_ID}
          role="note"
        >{t("These milestones follow the city currently shown on your map and update when that city changes.")}</p>
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
                  ? t("{{value0}} earned in {{value1}}", { value0: milestone.title, value1: progress.cityName })
                  : t("{{value0}} requires {{value1}} kilometers in {{value2}}. {{value3}} kilometers remaining.", { value0: milestone.title, value1: milestone.thresholdKm, value2: progress.cityName, value3: formatNumber(remainingKm, 1) })
              }
            >
              <AchievementArtwork
                image={milestone.image}
                title={milestone.title}
                size={42}
              />
              <strong>{milestone.title}</strong>
              {earned ? (
                <span className="account-milestone__goal">{t("Earned at {{value0}} km", { value0: milestone.thresholdKm })}</span>
              ) : (
                <span className="account-milestone__goal">
                  <strong>{t("{{value0}} / {{value1}}{{value2}} km", { value0: formatNumber(progress.discoveredKm, 1), value1: milestone.thresholdKm, value2: " " })}</strong>
                  <small>{t("{{value0}} km left", { value0: formatNumber(remainingKm, 1) })}</small>
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
