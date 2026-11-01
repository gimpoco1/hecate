/** Start weeks on Monday in the user's local timezone. */
export function journeyWeekStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date.getTime();
}

/** Calendar-day arithmetic preserves local midnight across daylight-saving changes. */
export function shiftJourneyDay(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}
