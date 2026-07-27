import { describe, expect, it } from 'vitest';
import { formatFirstSeen } from './domain-format';

describe('formatFirstSeen', () => {
  it('formats date-only and timestamp values without exposing raw API values', () => {
    expect(formatFirstSeen('2026-05-10', 'zh-CN')).toBe('2026/05/10');
    expect(formatFirstSeen('2026-05-10T08:30:00+08:00', 'en-US')).toBe('05/10/2026');
  });

  it('returns the localized fallback for empty or invalid values', () => {
    expect(formatFirstSeen('', 'zh-CN', '未知')).toBe('未知');
    expect(formatFirstSeen('not-a-date', 'en-US', 'Unknown')).toBe('Unknown');
  });
});
