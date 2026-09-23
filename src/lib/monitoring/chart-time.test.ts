import { describe, expect, it } from 'vitest';
import { createTimeAxisFormatter, createTimeTooltipFormatter } from './chart-time';

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

describe('createTimeTooltipFormatter', () => {
  it('formats ISO timestamps as full local date and time', () => {
    const timestamp = '2026-09-03T13:20:00.000Z';
    const parts = new Intl.DateTimeFormat('zh', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    expect(createTimeTooltipFormatter('zh')(timestamp)).toBe(
      `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`,
    );
  });

  it('preserves preformatted and invalid timestamps', () => {
    const format = createTimeTooltipFormatter('zh');
    expect(format('10:00')).toBe('10:00');
    expect(format('invalid timestamp')).toBe('invalid timestamp');
  });
});
