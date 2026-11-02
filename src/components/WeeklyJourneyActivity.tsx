import { useEffect, useState } from "react";
import type { DiscoveryJourneyMetric } from "../geo";
import { journeyWeekStart, type JourneyHistoryFilters } from "../journeyHistory";
import { JourneyWeekOverview } from "./JourneyWeekOverview";

type Props = {
  journeys: DiscoveryJourneyMetric[];
  onDaySelect: (day: number) => void;
};

export function WeeklyJourneyActivity({ journeys, onDaySelect }: Props) {
  const [filters, setFilters] = useState<JourneyHistoryFilters>(() => ({ weekStart: journeyWeekStart(Date.now()), selectedDay: null }));
  useEffect(() => {
    if (filters.selectedDay === null) return;
    const timeout = window.setTimeout(() => {
      setFilters(current => ({ weekStart: current.weekStart, selectedDay: null }));
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [filters]);
  return <JourneyWeekOverview journeys={journeys} weekStart={filters.weekStart} selectedDay={filters.selectedDay}
    onWeekChange={weekStart => setFilters({ weekStart, selectedDay: null })}
    onDateSelect={day => setFilters({ weekStart: journeyWeekStart(day), selectedDay: day })}
    onClearSelection={null} onDaySelect={onDaySelect} renderTotals={() => null} />;
}
