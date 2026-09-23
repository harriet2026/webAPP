import { describe, expect, it } from 'vitest';
import { isBehaviorControlRuleExpired } from './validity';

describe('behavior-control rule validity', () => {
  const now = new Date('2026-09-11T02:00:00Z');

  it('treats the exact valid-until boundary and past values as expired', () => {
    expect(isBehaviorControlRuleExpired('2026-09-11T01:59:59Z', now)).toBe(true);
    expect(isBehaviorControlRuleExpired('2026-09-11T02:00:00Z', now)).toBe(true);
  });

  it('keeps future, permanent, and malformed values out of the expired state', () => {
    expect(isBehaviorControlRuleExpired('2026-09-11T02:00:01Z', now)).toBe(false);
    expect(isBehaviorControlRuleExpired(null, now)).toBe(false);
    expect(isBehaviorControlRuleExpired('not-a-date', now)).toBe(false);
  });
});
