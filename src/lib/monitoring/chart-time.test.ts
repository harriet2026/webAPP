import { describe, expect, it } from 'vitest';
import { createTimeAxisFormatter } from './chart-time';

describe('createTimeAxisFormatter', () => {
  const timestamp = '2026-08-24T07:30:00.000Z';

  it('formats short-range labels as localized hours and minutes', () => {
    const format = createTimeAxisFormatter('en-US', false);
    expect(format(timestamp)).toBe(new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(timestamp)));
  });

  it('includes the localized date for long ranges', () => {
    const format = createTimeAxisFormatter('zh', true);
    expect(format(timestamp)).toBe(new Intl.DateTimeFormat('zh', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(timestamp)));
  });

  it('preserves preformatted and invalid timestamps', () => {
    const format = createTimeAxisFormatter('en-US', false);
    expect(format('10:00')).toBe('10:00');
    expect(format('invalid timestamp')).toBe('invalid timestamp');
  });
});
