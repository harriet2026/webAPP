import { describe, expect, test } from 'vitest';
import { EMAIL_TYPES } from '@/lib/api/statistics';

describe('EMAIL_TYPES (system-status, spec §3.1)', () => {
  test('EMAIL_TYPES has 11 flat email types', () => {
    expect(EMAIL_TYPES).toHaveLength(11);
    expect(EMAIL_TYPES).toContain('spoofing');
    expect(EMAIL_TYPES).not.toContain('high_risk_spam'); // 旧威胁类型键退场
    expect(EMAIL_TYPES).not.toContain('leak');
  });
});
