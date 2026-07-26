import { describe, it, expect } from 'vitest';
import {
  MAX_RANGE_DAYS,
  defaultCustomRange,
  timeRangeToDates,
  validateCustomRange,
} from './date-range';

// GT-11979 / GT-11930: the page only had 5 preset buttons, so no arbitrary
// start/end could be selected — PRD F1 ("时间范围…、自定义起止日期") requires it,
// and the landing spec simply omitted it (it is not in the §10 "不做" list).
//
// `now` is injected: timeRangeToDates used to call new Date() internally, which
// makes every preset untestable.
const NOW = new Date('2026-07-12T10:30:00');

describe('timeRangeToDates presets (unchanged behaviour)', () => {
  it('today = a single day', () => {
    expect(timeRangeToDates('today', defaultCustomRange(NOW), NOW)).toEqual({
      startDate: '2026-07-12',
      endDate: '2026-07-12',
    });
  });

  it('7d is inclusive of today — 6 days back, not 7', () => {
    expect(timeRangeToDates('7d', defaultCustomRange(NOW), NOW)).toEqual({
      startDate: '2026-07-06',
      endDate: '2026-07-12',
    });
  });

  it('30d is inclusive of today — 29 days back', () => {
    expect(timeRangeToDates('30d', defaultCustomRange(NOW), NOW)).toEqual({
      startDate: '2026-06-13',
      endDate: '2026-07-12',
    });
  });

  it('this_month runs from the 1st to today', () => {
    expect(timeRangeToDates('this_month', defaultCustomRange(NOW), NOW)).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-12',
    });
  });

  it('last_month is the whole previous month', () => {
    expect(timeRangeToDates('last_month', defaultCustomRange(NOW), NOW)).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
  });
});

describe('timeRangeToDates custom', () => {
  it('passes the custom range straight through', () => {
    expect(
      timeRangeToDates('custom', { start: '2026-05-15', end: '2026-05-21' }, NOW),
    ).toEqual({ startDate: '2026-05-15', endDate: '2026-05-21' });
  });

  it('defaultCustomRange seeds the last 7 days, matching the 7d preset', () => {
    const seeded = defaultCustomRange(NOW);
    expect(seeded).toEqual({ start: '2026-07-06', end: '2026-07-12' });
    // and that seed must itself be valid, or switching to 自定义 would open in
    // an error state
    expect(validateCustomRange(seeded)).toBeNull();
  });
});

describe('validateCustomRange', () => {
  it('accepts a well-formed range', () => {
    expect(validateCustomRange({ start: '2026-05-15', end: '2026-05-21' })).toBeNull();
  });

  it('accepts a single day (start === end)', () => {
    expect(validateCustomRange({ start: '2026-05-15', end: '2026-05-15' })).toBeNull();
  });

  it('rejects an empty date', () => {
    expect(validateCustomRange({ start: '', end: '2026-05-21' })).toBe('invalid');
    expect(validateCustomRange({ start: '2026-05-15', end: '' })).toBe('invalid');
  });

  it('rejects a malformed date', () => {
    expect(validateCustomRange({ start: '15/05/2026', end: '2026-05-21' })).toBe('invalid');
  });

  it('rejects end before start (PRD 4.1: start <= end)', () => {
    expect(validateCustomRange({ start: '2026-05-21', end: '2026-05-15' })).toBe('order');
  });

  // spec 3.3.1: days are counted as a CLOSED interval — days = end - start + 1.
  // The backend's previousPeriod() counts the same way. If the two disagree the
  // UI lets you pick a range the API then 400s on.
  it('accepts exactly MAX_RANGE_DAYS (closed interval)', () => {
    // 2025 is not a leap year: 2025-01-01 -> 2026-01-01 is 365 days APART,
    // which is 366 days INCLUSIVE — exactly the cap.
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(validateCustomRange({ start: '2025-01-01', end: '2026-01-01' })).toBeNull();
  });

  it('rejects MAX_RANGE_DAYS + 1', () => {
    // one day further: 366 apart = 367 inclusive
    expect(validateCustomRange({ start: '2025-01-01', end: '2026-01-02' })).toBe('tooLong');
  });

  // Guards the closed-vs-open counting itself (spec 3.3.1). If someone "fixes"
  // validateCustomRange to `difference > MAX_RANGE_DAYS` (dropping the +1), this
  // 367-day range starts passing and the backend 400s on it.
  it('counts days as a closed interval, not as a plain difference', () => {
    // 367 inclusive must fail; a plain-difference impl would compute 366 and allow it
    expect(validateCustomRange({ start: '2025-01-01', end: '2026-01-02' })).toBe('tooLong');
    // and a 2-day range must be 2, not 1 — single-day is the floor, already covered above
    expect(validateCustomRange({ start: '2026-05-15', end: '2026-05-16' })).toBeNull();
  });

  it('rejects the pathological full-table scan the cap exists for', () => {
    expect(validateCustomRange({ start: '1900-01-01', end: '2100-01-01' })).toBe('tooLong');
  });
});
