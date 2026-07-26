import { describe, expect, it } from 'vitest';
import {
  complexContentRuleEditHref,
  deriveContentRuleStatus,
  formatContentRuleId,
} from './ContentRulesTable';

describe('content rules table presentation', () => {
  const now = new Date('2026-07-16T00:00:00Z');

  it('keeps the real numeric id visible in a stable CR display alias', () => {
    expect(formatContentRuleId(42)).toBe('CR-000042');
  });

  it('derives status in expired/disabled/expiring/enabled order', () => {
    expect(deriveContentRuleStatus(true, '2026-07-15T23:59:59Z', now)).toBe('expired');
    expect(deriveContentRuleStatus(false, '2026-07-15T23:59:59Z', now)).toBe('expired');
    expect(deriveContentRuleStatus(false, '2026-07-20T00:00:00Z', now)).toBe('disabled');
    expect(deriveContentRuleStatus(true, '2026-07-20T00:00:00Z', now)).toBe('expiringSoon');
    expect(deriveContentRuleStatus(true, '2026-08-20T00:00:00Z', now)).toBe('enabled');
    expect(deriveContentRuleStatus(true, null, now)).toBe('enabled');
  });

  it('opens a complex data-stage rule in the existing advanced editor instead of the removed action route', () => {
    expect(complexContentRuleEditHref(42)).toBe('/rules/data?edit_rule_id=42');
  });
});
