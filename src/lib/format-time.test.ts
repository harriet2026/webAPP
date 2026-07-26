import { describe, expect, it } from 'vitest';
import { formatTimestamp, toRFC3339 } from './format-time';

describe('formatTimestamp (GT-11971)', () => {
  it('formats an ISO 8601 UTC timestamp to local "YYYY-MM-DD HH:mm:ss"', () => {
    // 2026-07-09T01:40:10Z -> UTC+8 09:40:10 (the ticket's expected output)
    expect(formatTimestamp('2026-07-09T01:40:10.891005Z')).toBe('2026-07-09 09:40:10');
  });

  it('returns "" for null / empty so callers fall back to their placeholder', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp('')).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
  });

  it('returns "" for an unparseable value (no throw)', () => {
    expect(formatTimestamp('not a date')).toBe('');
  });

  it('handles a plain ISO without millis / zone', () => {
    expect(formatTimestamp('2026-06-18T09:12:03')).toBe('2026-06-18 09:12:03');
  });
});

describe('toRFC3339', () => {
  it('converts browser date input values to the RFC3339 format required by rule APIs', () => {
    expect(toRFC3339('2026-07-17')).toBe('2026-07-17T00:00:00.000Z');
  });

  it('normalizes datetime-local values before sending them to an API', () => {
    const input = '2026-07-17T09:30';
    expect(toRFC3339(input)).toBe(new Date(input).toISOString());
  });

  it('returns undefined for empty and invalid optional values', () => {
    expect(toRFC3339('')).toBeUndefined();
    expect(toRFC3339('not-a-date')).toBeUndefined();
  });
});
