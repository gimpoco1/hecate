import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import type { DiscoveryJourneyRoute } from "../geo";
import { ArrowLeftIcon, RouteIcon, XIcon } from "./Icons";

type Props = {
  journeys: DiscoveryJourneyRoute[];
  onShowMap: (journey: DiscoveryJourneyRoute) => void;
  onBack: () => void;
  onClose: () => void;
};

function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${formatNumber(distanceKm, 2)} km`;
}

export function JourneyHistory({ journeys, onShowMap, onBack, onClose }: Props) {
  useAppTranslation();
  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet profile-collection-sheet journey-history-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-history-title" onClick={event => event.stopPropagation()}>
      <button type="button" className="icon-button walking-stats-back" aria-label={t("Back to profile")} onClick={onBack}><ArrowLeftIcon /></button>
      <button type="button" className="icon-button sheet__close" aria-label={t("Close")} onClick={onClose}><XIcon /></button>
      <div className="eyebrow">{t("Your map")}</div>
      <h2 id="journey-history-title">{t("Journey history")}</h2>
      <p className="journey-history-legend"><span>{t("Travelled")}</span><span>{t("New ground")}</span></p>
      {journeys.length === 0 && <p>{t("No completed walks yet")}</p>}
      <div className="journey-history-list">
        {journeys.map(journey => <article className="journey-history-entry" key={journey.journeyId} data-testid="journey-history-entry">
          <header className="journey-history-entry__header">
            <time dateTime={new Date(journey.startedAt).toISOString()}>
              <strong>{new Date(journey.startedAt).toLocaleDateString(currentLanguage(), { dateStyle: "medium" })}</strong>
              <span>{new Date(journey.startedAt).toLocaleTimeString(currentLanguage(), { timeStyle: "short" })}</span>
            </time>
            <span className="journey-history-entry__duration">{Math.round((journey.finishedAt - journey.startedAt) / 60000)} min</span>
          </header>
          <dl className="journey-history-entry__metrics">
            <div><dt>{t("Travelled")}</dt><dd>{formatDistance(journey.travelledKm)}</dd></div>
            <div><dt>{t("New ground")}</dt><dd>{formatDistance(journey.newGroundKm)}</dd></div>
          </dl>
          <button className="journey-history-entry__map" type="button" data-testid="journey-history-show-map" onClick={() => onShowMap(journey)}><RouteIcon size={17} strokeWidth={1.8} />{t("View on map")}</button>
        </article>)}
      </div>
    </section>
  </div>;
}
