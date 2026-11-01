import { useState } from "react";
import { journeyWeekStart, shiftJourneyDay } from "../journeyHistory";
import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import type { DiscoveryJourneyRoute } from "../geo";
import { ArrowLeftIcon, ChevronIcon, RouteIcon, XIcon } from "./Icons";

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
  const currentWeek = journeyWeekStart(Date.now());
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const weekEnd = shiftJourneyDay(weekStart, 7);
  const weekJourneys = journeys.filter(journey => journey.startedAt >= weekStart && journey.startedAt < weekEnd);
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = shiftJourneyDay(weekStart, index);
    const end = shiftJourneyDay(start, 1);
    return { start, count: weekJourneys.filter(journey => journey.startedAt >= start && journey.startedAt < end).length };
  });
  const largestCount = Math.max(1, ...days.map(day => day.count));
  const visibleJourneys = weekJourneys.filter(journey => selectedDay === null || (journey.startedAt >= selectedDay && journey.startedAt < shiftJourneyDay(selectedDay, 1)))
    .sort((first, second) => second.startedAt - first.startedAt);
  const oldestWeek = journeys.reduce((oldest, journey) => Math.min(oldest, journeyWeekStart(journey.startedAt)), currentWeek);
  const moveWeek = (offset: number): void => {
    setWeekStart(shiftJourneyDay(weekStart, offset * 7));
    setSelectedDay(null);
  };
  const weeksAgo = Math.round((currentWeek - weekStart) / (7 * 24 * 60 * 60 * 1000));
  const weekTitle = weeksAgo === 0 ? t("This week") : weeksAgo === 1 ? t("Last week")
    : new Intl.RelativeTimeFormat(currentLanguage(), { numeric: "always" }).format(-weeksAgo, "week");
  const rangeFormat = new Intl.DateTimeFormat(currentLanguage(), { month: "short", day: "numeric", year: "numeric" });
  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet profile-collection-sheet journey-history-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-history-title" onClick={event => event.stopPropagation()}>
      <button type="button" className="icon-button walking-stats-back" aria-label={t("Back to profile")} onClick={onBack}><ArrowLeftIcon /></button>
      <button type="button" className="icon-button sheet__close" aria-label={t("Close")} onClick={onClose}><XIcon /></button>
      <div className="eyebrow">{t("Your map")}</div>
      <h2 id="journey-history-title">{t("Journey history")}</h2>
      <section className="journey-week" aria-label={t("Journeys per day")}>
        <div className="journey-week__navigation">
          <button type="button" className="icon-button journey-week__previous" data-testid="journey-week-previous" aria-label={t("Previous week")} disabled={weekStart <= oldestWeek} onClick={() => moveWeek(-1)}><ChevronIcon size={18} /></button>
          <div><div className="journey-week__title"><strong>{weekTitle}</strong><span aria-live="polite">{t("journeyCount", { count: weekJourneys.length })}</span></div><span>{rangeFormat.format(weekStart)} – {rangeFormat.format(shiftJourneyDay(weekStart, 6))}</span></div>
          <button type="button" className="icon-button" data-testid="journey-week-next" aria-label={t("Next week")} disabled={weekStart >= currentWeek} onClick={() => moveWeek(1)}><ChevronIcon size={18} /></button>
        </div>
        <div className="journey-week__chart">
          {days.map(day => <button type="button" key={day.start} data-testid={`journey-day-${new Date(day.start).getDay()}`} aria-pressed={selectedDay === day.start}
            aria-label={t("journeysOnDay", { count: day.count, date: new Date(day.start).toLocaleDateString(currentLanguage(), { dateStyle: "full" }) })}
            onClick={() => setSelectedDay(selectedDay === day.start ? null : day.start)}>
            <span className="journey-week__bar-space"><span className="journey-week__count">{day.count > 0 ? day.count : ""}</span><span className="journey-week__bar" style={{ height: `${day.count / largestCount * 48}px` }} /></span>
            <span className="journey-week__weekday">{new Date(day.start).toLocaleDateString(currentLanguage(), { weekday: "short" })}</span>
            <span className="journey-week__date">{new Date(day.start).getDate()}</span>
          </button>)}
        </div>
      </section>
      {visibleJourneys.length === 0 && <p className="journey-history-empty" role="status">{t(selectedDay === null ? "No journeys this week." : "No journeys on this day.")}</p>}
      <div className="journey-history-list">
        {visibleJourneys.map(journey => <article className="journey-history-entry" key={journey.journeyId} data-testid="journey-history-entry">
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
