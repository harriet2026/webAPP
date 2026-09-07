export type DayBoundary = 'start' | 'end';

// The date picker exposes a calendar date without a timezone. Convert that
// browser-local day to an explicit UTC instant before calling the API; sending
// YYYY-MM-DD directly would make the server interpret it as a UTC day.
export function browserLocalDayBoundary(date: string, boundary: DayBoundary): string | undefined {
  if (!date) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const local = boundary === 'end'
    ? new Date(year, monthIndex, day, 23, 59, 59, 999)
    : new Date(year, monthIndex, day, 0, 0, 0, 0);

  if (
    local.getFullYear() !== year
    || local.getMonth() !== monthIndex
    || local.getDate() !== day
  ) {
    return undefined;
  }
  return local.toISOString();
}
