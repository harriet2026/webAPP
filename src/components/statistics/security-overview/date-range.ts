// Date-range derivation for the security-overview filter bar.
//
// GT-11979 / GT-11930: PRD F1 requires "时间范围(今天/近7天/…/上月)、自定义起止日期",
// but only the presets shipped. This module owns both the preset -> dates mapping
// (lifted out of SecurityOverviewPage so it is testable — it used to call
// `new Date()` internally, which no test can pin) and the custom-range validation.

import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays, isValid, parse } from 'date-fns';
import type { TimeRange } from '@/lib/api/security-overview';

// Days are counted as a CLOSED interval: days = end - start + 1, matching the
// backend's previousPeriod() (internal/storage/security_overview.go). Do NOT
// copy validateLAFilters' `end.Sub(start) > 90*24h` style — that is a plain
// difference, so its "90" actually admits 91 inclusive days. Frontend and
// backend must count identically or the UI offers ranges the API then rejects.
export const MAX_RANGE_DAYS = 366; // 366, not 365: a leap year is still one year

export interface CustomRange {
  start: string;
  end: string;
}

export type RangeError = 'invalid' | 'order' | 'tooLong' | null;

const LAYOUT = 'yyyy-MM-dd';

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = parse(s, LAYOUT, new Date());
  return isValid(d) ? d : null;
}

export function validateCustomRange({ start, end }: CustomRange): RangeError {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return 'invalid';
  if (e < s) return 'order';
  if (differenceInCalendarDays(e, s) + 1 > MAX_RANGE_DAYS) return 'tooLong';
  return null;
}

/** Seed for the custom inputs when the user first switches to 自定义 — the 7d
 *  preset, so the range opens on something valid and familiar. */
export function defaultCustomRange(now: Date = new Date()): CustomRange {
  return {
    start: format(subDays(now, 6), LAYOUT),
    end: format(now, LAYOUT),
  };
}

export function timeRangeToDates(
  timeRange: TimeRange,
  custom: CustomRange,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  switch (timeRange) {
    case 'today':
      return { startDate: format(now, LAYOUT), endDate: format(now, LAYOUT) };
    case '7d':
      return { startDate: format(subDays(now, 6), LAYOUT), endDate: format(now, LAYOUT) };
    case '30d':
      return { startDate: format(subDays(now, 29), LAYOUT), endDate: format(now, LAYOUT) };
    case 'this_month':
      return { startDate: format(startOfMonth(now), LAYOUT), endDate: format(now, LAYOUT) };
    case 'last_month': {
      const last = subMonths(now, 1);
      return { startDate: format(startOfMonth(last), LAYOUT), endDate: format(endOfMonth(last), LAYOUT) };
    }
    case 'custom':
      return { startDate: custom.start, endDate: custom.end };
    default:
      return { startDate: format(subDays(now, 6), LAYOUT), endDate: format(now, LAYOUT) };
  }
}
