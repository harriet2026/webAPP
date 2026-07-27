/**
 * Returns the inclusive calendar day count between two ISO date strings
 * (yyyy-MM-dd). Both the start and end day are counted, so
 * inclusiveCalendarDayCount('2024-01-01', '2024-01-01') === 1 and
 * inclusiveCalendarDayCount('2024-01-01', '2024-01-07') === 7.
 *
 * Returns null if either argument is empty or cannot be parsed.
 */
export function inclusiveCalendarDayCount(
  startDate: string,
  endDate: string,
): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}
