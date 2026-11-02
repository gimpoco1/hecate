import { useState } from "react";
import { exportJourneyGpx } from "../gpxExport";
import { errorDiagnostic } from "../diagnostics";
import { mdiCalendarOutline, mdiDownload } from "@mdi/js";
import { formatElapsedDuration } from "../durationFormat";
import { journeyDateValue, parseJourneyDate, journeyWeekStart, shiftJourneyDay, type JourneyHistoryFilters, type JourneyHistoryEntry } from "../journeyHistory";
import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import type { DiscoveryJourneyRoute } from "../geo";
import { ArrowLeftIcon, ChevronIcon, RouteIcon, XIcon } from "./Icons";

type Props = {
  journeys: JourneyHistoryEntry[];
  loading: boolean;
  filters: JourneyHistoryFilters;
  onFiltersChange: (filters: JourneyHistoryFilters) => void;
  onShowMap: (journey: DiscoveryJourneyRoute) => void;
  onBack: () => void;
  onClose: () => void;
};

function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${formatNumber(distanceKm, 2)} km`;
}

export function JourneyHistory({ journeys, loading, filters, onFiltersChange, onShowMap, onBack, onClose }: Props) {
  useAppTranslation();
  const [exportingJourney, setExportingJourney] = useState<string | null>(null);
  const [exportError, setExportError] = useState<{ journeyId: string; message: string } | null>(null);
  const exportGpx = async (journey: DiscoveryJourneyRoute): Promise<void> => {
    setExportingJourney(journey.journeyId);
    setExportError(null);
    try {
      await exportJourneyGpx(journey.points);
    } catch (failure) {
      console.error("Journey GPX export failed", { journeyId: journey.journeyId, error: errorDiagnostic(failure) });
      setExportError({ journeyId: journey.journeyId, message: failure instanceof Error ? failure.message : t("Could not export this journey. Check available storage and try again.") });
    } finally {
      setExportingJourney(null);
    }
  };
  const currentWeek = journeyWeekStart(Date.now());
  const { weekStart, selectedDay } = filters;
  const earliestJourney = journeys.reduce((earliest, journey) => Math.min(earliest, journey.startedAt), Date.now());
  const weekEnd = shiftJourneyDay(weekStart, 7);
  const weekJourneys = journeys.filter(journey => journey.startedAt >= weekStart && journey.startedAt < weekEnd);
  const weekTotals = weekJourneys.reduce((totals, journey) => ({
    travelledKm: totals.travelledKm + journey.travelledKm,
    newGroundKm: totals.newGroundKm + journey.newGroundKm,
    durationMs: totals.durationMs + Math.max(0, journey.finishedAt - journey.startedAt),
  }), { travelledKm: 0, newGroundKm: 0, durationMs: 0 });
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
    onFiltersChange({ weekStart: shiftJourneyDay(weekStart, offset * 7), selectedDay: null });
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
          <div><div className="journey-week__title"><strong>{weekTitle}</strong><span aria-live="polite">{t("journeyCount", { count: weekJourneys.length })}</span></div><label className="journey-week__date-picker" title={t("Jump to date")}>
            <span>{rangeFormat.format(weekStart)} – {rangeFormat.format(shiftJourneyDay(weekStart, 6))}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiCalendarOutline} /></svg>
            <input type="date" data-testid="journey-jump-date" aria-label={t("Jump to date")} min={journeyDateValue(earliestJourney)} max={journeyDateValue(Date.now())}
              value={selectedDay === null ? "" : journeyDateValue(selectedDay)}
              onChange={event => {
                const value = event.currentTarget.value;
                if (!value) { onFiltersChange({ weekStart, selectedDay: null }); return; }
                if (!event.currentTarget.reportValidity()) return;
                const day = parseJourneyDate(value);
                onFiltersChange({ weekStart: journeyWeekStart(day), selectedDay: day });
              }} />
          </label></div>
          <button type="button" className="icon-button" data-testid="journey-week-next" aria-label={t("Next week")} disabled={weekStart >= currentWeek} onClick={() => moveWeek(1)}><ChevronIcon size={18} /></button>
        </div>
        <div className="journey-week__chart">
          {days.map(day => <button type="button" key={day.start} data-testid={`journey-day-${new Date(day.start).getDay()}`} aria-pressed={selectedDay === day.start}
            aria-label={t("journeysOnDay", { count: day.count, date: new Date(day.start).toLocaleDateString(currentLanguage(), { dateStyle: "full" }) })}
            onClick={() => onFiltersChange({ weekStart, selectedDay: selectedDay === day.start ? null : day.start })}>
            <span className="journey-week__bar-space"><span className="journey-week__count">{day.count > 0 ? day.count : ""}</span><span className="journey-week__bar" style={{ height: `${day.count / largestCount * 48}px` }} /></span>
            <span className="journey-week__weekday">{new Date(day.start).toLocaleDateString(currentLanguage(), { weekday: "short" })}</span>
            <span className="journey-week__date">{new Date(day.start).getDate()}</span>
          </button>)}
        </div>
        <dl className="journey-week__totals" aria-label={t("Weekly totals")} data-testid="journey-week-totals">
          <div><dt>{t("Travelled")}</dt><dd>{formatDistance(weekTotals.travelledKm)}</dd></div>
          <div><dt>{t("New ground")}</dt><dd>{formatDistance(weekTotals.newGroundKm)}</dd></div>
          <div><dt>{t("Active time")}</dt><dd>{formatElapsedDuration(weekTotals.durationMs)}</dd></div>
        </dl>
      </section>
      {selectedDay !== null && <div className="journey-history-selection">
        <span role="status">{new Date(selectedDay).toLocaleDateString(currentLanguage(), { weekday: "long", month: "short", day: "numeric" })} · {t("journeyCount", { count: visibleJourneys.length })}</span>
        <button type="button" className="journey-history-tools__clear" data-testid="journey-clear-filter" onClick={() => onFiltersChange({ weekStart, selectedDay: null })}><XIcon size={13} />{t("Clear filter")}</button>
      </div>}
      {!loading && visibleJourneys.length === 0 && <p className="journey-history-empty" role="status">{t(selectedDay === null ? "No journeys this week." : "No journeys on this day.")}</p>}
      {loading && journeys.length === 0 && <p className="journey-history-empty" role="status">{t("Loading journeys…")}</p>}
      <div className="journey-history-list" aria-busy={loading}>
        {visibleJourneys.map(journey => <article className="collection-card journey-history-entry" key={journey.journeyId} data-testid="journey-history-entry">
          <header className="journey-history-entry__header">
            <time dateTime={new Date(journey.startedAt).toISOString()}>
              <strong>{new Date(journey.startedAt).toLocaleDateString(currentLanguage(), { dateStyle: "medium" })}</strong>
              <span>{new Date(journey.startedAt).toLocaleTimeString(currentLanguage(), { timeStyle: "short" })}</span>
            </time>
          </header>
          <div className="journey-history-entry__meta">
            <div className="journey-history-entry__cities">{journey.cityNames.map(name => <span className="journey-history-entry__city" data-testid="journey-history-city" key={name}>{name}</span>)}</div>
            <span className="journey-history-entry__duration">{formatElapsedDuration(journey.finishedAt - journey.startedAt)}</span>
          </div>
          {exportError?.journeyId === journey.journeyId && <p className="journey-history-entry__export-error" role="alert">{exportError.message}</p>}
          <dl className="collection-card__metrics">
            <div><dt>{t("Travelled")}</dt><dd>{formatDistance(journey.travelledKm)}</dd></div>
            <div><dt>{t("New ground")}</dt><dd>{formatDistance(journey.newGroundKm)}</dd></div>
          </dl>
          <div className="collection-card__actions">
            <button className="collection-card__primary" type="button" data-testid="journey-history-show-map" onClick={() => onShowMap(journey)}><RouteIcon size={16} strokeWidth={1.8} />{t("View on map")}</button>
            <button className="collection-card__secondary journey-history-entry__export" type="button" data-testid="journey-export-gpx" disabled={exportingJourney !== null} aria-busy={exportingJourney === journey.journeyId} onClick={() => void exportGpx(journey)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiDownload} /></svg>{t("Export GPX")}
            </button>
          </div>
        </article>)}
      </div>
    </section>
  </div>;
}
