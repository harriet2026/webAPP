const DAY_MS = 86_400_000;

function parseDateOnlyUTC(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return timestamp;
}

/** Returns the number of natural dates in an inclusive YYYY-MM-DD range. */
export function inclusiveCalendarDayCount(startDate: string, endDate: string): number | null {
  const start = parseDateOnlyUTC(startDate);
  const end = parseDateOnlyUTC(endDate);
  if (start == null || end == null || end < start) return null;
  return Math.floor((end - start) / DAY_MS) + 1;
}
