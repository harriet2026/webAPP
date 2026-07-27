import { describe, expect, it } from 'vitest';
import { inclusiveCalendarDayCount } from './date-range';

describe('delivery traffic inclusive calendar-day range (GT-12452)', () => {
  it.each([
    ['2026-01-01', '2026-01-01', 1],
    ['2026-01-01', '2026-03-31', 90],
    ['2026-01-01', '2026-04-01', 91],
    ['2024-01-01', '2024-03-30', 90],
    ['2024-01-01', '2024-03-31', 91],
  ])('counts %s through %s as %i natural days', (start, end, want) => {
    expect(inclusiveCalendarDayCount(start, end)).toBe(want);
  });

  it('is independent of the browser timezone and daylight-saving transitions', () => {
    expect(inclusiveCalendarDayCount('2026-03-01', '2026-03-31')).toBe(31);
  });

  it.each([
    ['', '2026-01-01'],
    ['2026-02-30', '2026-03-01'],
    ['2026-03-02', '2026-03-01'],
  ])('rejects invalid or reversed input %s..%s', (start, end) => {
    expect(inclusiveCalendarDayCount(start, end)).toBeNull();
  });
});
