import { JourneyWeekOverview, renderJourneyTotals } from "./JourneyWeekOverview";
import { useState } from "react";
import { exportJourneyGpx } from "../gpxExport";
import { errorDiagnostic } from "../diagnostics";
import { mdiDownload } from "@mdi/js";
import { formatElapsedDuration } from "../durationFormat";
import { journeyWeekStart, shiftJourneyDay, type JourneyHistoryFilters, type JourneyHistoryEntry } from "../journeyHistory";
import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import type { DiscoveryJourneyRoute } from "../geo";
import { ArrowLeftIcon, RouteIcon, XIcon } from "./Icons";

type Props = {
  backLabel: string;
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

export function JourneyHistory({ backLabel, journeys, loading, filters, onFiltersChange, onShowMap, onBack, onClose }: Props) {
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
  const { weekStart, selectedDay } = filters;
  const weekEnd = shiftJourneyDay(weekStart, 7);
  const weekJourneys = journeys.filter(journey => journey.finishedAt >= weekStart && journey.finishedAt < weekEnd);
  const visibleJourneys = weekJourneys.filter(journey => selectedDay === null || (journey.finishedAt >= selectedDay && journey.finishedAt < shiftJourneyDay(selectedDay, 1)))
    .sort((first, second) => second.startedAt - first.startedAt);
  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet profile-collection-sheet journey-history-sheet" role="dialog" aria-modal="true" aria-labelledby="journey-history-title" onClick={event => event.stopPropagation()}>
      <button type="button" className="icon-button walking-stats-back" aria-label={backLabel} onClick={onBack}><ArrowLeftIcon /></button>
      <button type="button" className="icon-button sheet__close" aria-label={t("Close")} onClick={onClose}><XIcon /></button>
      <div className="eyebrow">{t("Your map")}</div>
      <h2 id="journey-history-title">{t("Journey history")}</h2>
      <JourneyWeekOverview renderTotals={renderJourneyTotals} journeys={journeys} weekStart={weekStart} selectedDay={selectedDay}
        onClearSelection={() => onFiltersChange({ weekStart, selectedDay: null })}
        onDateSelect={day => onFiltersChange({ weekStart: journeyWeekStart(day), selectedDay: day })}
        onWeekChange={week => onFiltersChange({ weekStart: week, selectedDay: null })}
        onDaySelect={day => onFiltersChange({ weekStart: journeyWeekStart(day), selectedDay: selectedDay === day ? null : day })} />
      {!loading && weekJourneys.length > 0 && visibleJourneys.length === 0 && <p className="journey-history-empty" role="status">{t(selectedDay === null ? "No journeys this week." : "No journeys on this day.")}</p>}
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
