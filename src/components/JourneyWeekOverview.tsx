import type { ReactNode } from "react";
import { mdiCalendarOutline } from "@mdi/js";
import { formatElapsedDuration } from "../durationFormat";
import { journeyDateValue, parseJourneyDate, journeyWeekStart, shiftJourneyDay } from "../journeyHistory";
import { ChevronIcon, XIcon } from "./Icons";
import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import type { DiscoveryJourneyMetric } from "../geo";
import { type JourneyActivityTotals, journeyActivityTotals, weeklyJourneyActivity } from "../weeklyJourneyActivity";

type Props = {
  journeys: DiscoveryJourneyMetric[];
  weekStart: number;
  selectedDay: number | null;
  onWeekChange: (weekStart: number) => void;
  onDaySelect: (day: number) => void;
  onDateSelect: (day: number) => void;
  onClearSelection: (() => void) | null;
  renderTotals: (summary: JourneyActivityTotals, label: string) => ReactNode;
};

function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${formatNumber(distanceKm, distanceKm < 10 ? 2 : 1)} km`;
}

export function JourneyWeekOverview({ journeys, weekStart, selectedDay, onWeekChange, onDaySelect, onDateSelect, onClearSelection, renderTotals }: Props) {
  useAppTranslation();
  const currentWeek = journeyWeekStart(Date.now());
  const weekOffset = Math.round((weekStart - currentWeek) / (7 * 24 * 60 * 60 * 1000));
  const earliestJourney = journeys.reduce((earliest, journey) => Math.min(earliest, journey.finishedAt), Date.now());
  const oldestWeek = journeys.reduce((oldest, journey) => Math.min(oldest, journeyWeekStart(journey.finishedAt)), currentWeek);
  const activity = weeklyJourneyActivity(journeys, weekStart);
  const summary = selectedDay === null ? activity : journeyActivityTotals(journeys.filter(journey => journey.finishedAt >= selectedDay && journey.finishedAt < shiftJourneyDay(selectedDay, 1)));
  const summaryLabel = selectedDay === null ? t("Weekly totals") : new Date(selectedDay).toLocaleDateString(currentLanguage(), { weekday: "long", month: "short", day: "numeric" });
  const maxDistance = Math.max(0, ...activity.days.map(day => day.travelledKm));
  const weekTitle = weekOffset === 0 ? t("This week") : weekOffset === -1 ? t("Last week")
    : new Intl.RelativeTimeFormat(currentLanguage(), { numeric: "always" }).format(weekOffset, "week");
  const rangeFormat = new Intl.DateTimeFormat(currentLanguage(), { month: "short", day: "numeric", year: "numeric" });
  const ratioLabel = summary.discoveryRatio === null ? "—" : `${formatNumber(summary.discoveryRatio * 100, 0)}%`;
  return <section className="journey-week" data-testid="journey-week-overview" aria-label={weekTitle}>
    <div className="journey-week__navigation weekly-journey-activity__navigation">
      <button type="button" className="icon-button journey-week__previous" data-testid="journey-week-previous" aria-label={t("Previous week")} disabled={weekStart <= oldestWeek} onClick={() => onWeekChange(shiftJourneyDay(weekStart, -7))}><ChevronIcon size={18} /></button>
      <div>
        <div className="journey-week__title"><strong>{weekTitle}</strong><span aria-live="polite">{t("journeyCount", { count: activity.journeyCount })}</span></div>
        <label className="journey-week__date-picker" title={t("Jump to date")}>
          <span>{rangeFormat.formatRange(weekStart, shiftJourneyDay(weekStart, 6))}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiCalendarOutline} /></svg>
          <input type="date" data-testid="journey-jump-date" aria-label={t("Jump to date")} min={journeyDateValue(earliestJourney)} max={journeyDateValue(Date.now())}
            value={journeyDateValue(selectedDay ?? Math.max(earliestJourney, weekStart === currentWeek ? Date.now() : weekStart))} onChange={event => {
              if (!event.currentTarget.value) { onDateSelect(parseJourneyDate(journeyDateValue(Date.now()))); return; }
              if (event.currentTarget.reportValidity()) onDateSelect(parseJourneyDate(event.currentTarget.value));
            }} />
        </label>
      </div>
      <button type="button" className="icon-button" data-testid="journey-week-next" aria-label={t("Next week")} disabled={weekOffset >= 0} onClick={() => onWeekChange(shiftJourneyDay(weekStart, 7))}><ChevronIcon size={18} /></button>
    </div>
    {activity.journeyCount === 0 ? <div className="journey-week__empty" data-testid="journey-week-empty" role="status">
      <span className="journey-week__empty-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d={mdiCalendarOutline} /></svg></span>
      <strong>{t("No journeys this week.")}</strong>
    </div> : <>
      <div className="weekly-journey-activity__heading">
        <div className="weekly-journey-activity__active-label"><span>{t("Active days")}</span><strong data-testid="weekly-active-days" aria-label={t("{{value0}} of 7 days", { value0: activity.activeDays })}>{activity.activeDays}/7</strong></div>
        <span className="weekly-journey-activity__legend"><i aria-hidden="true" />{t("New ground")}</span>
      </div>
      <div className="weekly-journey-activity__days">
        {activity.days.map(day => {
          const distanceLabel = formatDistance(day.travelledKm);
          const newGroundLabel = formatDistance(day.newGroundKm);
          return <button type="button" key={day.startedAt} className="weekly-journey-activity__day" data-testid={`journey-day-${new Date(day.startedAt).getDay()}`} aria-pressed={selectedDay === day.startedAt} disabled={day.startedAt > Date.now()} onClick={() => onDaySelect(day.startedAt)}
            title={t("New ground added: {{distance}}", { distance: newGroundLabel })}
            aria-label={t("{{date}}: {{distance}} travelled", { date: new Date(day.startedAt).toLocaleDateString(currentLanguage(), { dateStyle: "full" }), distance: distanceLabel }) + `. ${t("New ground added: {{distance}}", { distance: newGroundLabel })}`}>
            <span className="weekly-journey-activity__bar-space" aria-hidden="true">
              <span className="weekly-journey-activity__distance">{day.travelledKm > 0 ? distanceLabel : ""}</span>
              <span className="weekly-journey-activity__bar" data-testid={`activity-day-${new Date(day.startedAt).getDay()}`} style={{ height: `${maxDistance > 0 ? day.travelledKm / maxDistance * 56 : 0}px` }}>
                <span className="weekly-journey-activity__new-ground" data-testid={`activity-new-ground-${new Date(day.startedAt).getDay()}`} style={{ height: `${day.travelledKm > 0 ? Math.min(1, day.newGroundKm / day.travelledKm) * 100 : 0}%` }} />
              </span>
            </span>
            <span aria-hidden="true">{new Date(day.startedAt).toLocaleDateString(currentLanguage(), { weekday: "short" })}</span>
            <small aria-hidden="true">{new Date(day.startedAt).getDate()}</small>
          </button>;
        })}
      </div>
    </>}
    {selectedDay !== null && onClearSelection !== null && <div className="journey-week__selection">
      <span role="status">{summaryLabel} · {t("journeyCount", { count: summary.journeyCount })}</span>
      <button type="button" className="journey-history-tools__clear" data-testid="journey-clear-filter" onClick={onClearSelection}><XIcon size={13} />{t("Clear filter")}</button>
    </div>}
    {activity.journeyCount > 0 && <>
      {renderTotals(summary, summaryLabel)}
      <div className="weekly-journey-activity__discovery-summary">
        <div className="weekly-journey-activity__heading"><span>{t("Discovery ratio")}</span><strong data-testid="weekly-discovery-ratio">{ratioLabel}</strong></div>
        {summary.discoveryRatio !== null && <div className="weekly-journey-activity__ratio" aria-hidden="true"><span style={{ width: `${summary.discoveryRatio * 100}%` }} /></div>}
      </div>
    </>}
  </section>;
}

export function renderJourneyTotals(summary: JourneyActivityTotals, summaryLabel: string): ReactNode {
  return <dl className="journey-week__totals" aria-label={summaryLabel} data-testid="journey-week-totals">
    <div><dt>{t("Travelled")}</dt><dd>{formatDistance(summary.travelledKm)}</dd></div>
    <div><dt>{t("New ground")}</dt><dd>{formatDistance(summary.newGroundKm)}</dd></div>
    <div><dt>{t("Active time")}</dt><dd>{formatElapsedDuration(summary.durationMs)}</dd></div>
  </dl>;
}
