import { describe, expect, it } from 'vitest';

import { browserLocalDayBoundary } from './login-history-date-range';

describe('browserLocalDayBoundary', () => {
  it('converts an Asia/Shanghai calendar day to exact UTC boundaries', () => {
    expect(browserLocalDayBoundary('2032-04-15', 'start')).toBe('2032-04-14T16:00:00.000Z');
    expect(browserLocalDayBoundary('2032-04-15', 'end')).toBe('2032-04-15T15:59:59.999Z');
  });

  it('keeps an empty filter empty', () => {
    expect(browserLocalDayBoundary('', 'start')).toBeUndefined();
    expect(browserLocalDayBoundary('', 'end')).toBeUndefined();
  });
});
