import { describe, it, expect } from 'vitest';
import { getAdvancedRulesPriorityRange, isPriorityInRange } from './priority-range';
import { emptyRuleForm } from './rule-form';

// GT-12181: the advanced-rules priority input used a fixed html_spec range of
// 1-100 (default 50) with no role semantics, while internal/api.validatePriority
// rejects any tenant_admin priority < 100 (or > 1000). A tenant admin saving
// with the UI default (50) always got 400 "tenant admin priority must be
// between 100 and 1000". The fix mirrors GT-12165 (behavior-control): the range
// is role-aware and matches the API.
describe('getAdvancedRulesPriorityRange', () => {
  it('tenant admin uses the API-accepted 100-1000 range with an in-range default', () => {
    const r = getAdvancedRulesPriorityRange(false);
    expect(r.min).toBe(100);
    expect(r.max).toBe(1000);
    // regression: default must be a value the tenant API will accept (>= 100)
    expect(r.defaultValue).toBeGreaterThanOrEqual(r.min);
    expect(r.defaultValue).toBeLessThanOrEqual(r.max);
  });

  it('system admin keeps the full project-wide 0-9999 range', () => {
    const r = getAdvancedRulesPriorityRange(true);
    expect(r.min).toBe(0);
    expect(r.max).toBe(9999);
  });
});

describe('isPriorityInRange (tenant admin 100-1000)', () => {
  const r = getAdvancedRulesPriorityRange(false);
  it.each([
    [99, false],
    [100, true],
    [600, true],
    [1000, true],
    [1001, false],
  ])('priority %i -> %s', (p, ok) => {
    expect(isPriorityInRange(p, r)).toBe(ok);
  });
});

describe('isPriorityInRange (system admin 0-9999)', () => {
  const r = getAdvancedRulesPriorityRange(true);
  it.each([
    [0, true],
    [9999, true],
    [10000, false],
    [-1, false],
  ])('priority %i -> %s', (p, ok) => {
    expect(isPriorityInRange(p, r)).toBe(ok);
  });
});

describe('emptyRuleForm honours the role-aware default priority', () => {
  it('defaults to the provided (in-range) priority for a tenant admin', () => {
    const range = getAdvancedRulesPriorityRange(false);
    const form = emptyRuleForm(range.defaultValue);
    expect(form.priority).toBe(range.defaultValue);
    // regression guard: the tenant default must never fall back to the old
    // out-of-range 50.
    expect(form.priority).toBeGreaterThanOrEqual(range.min);
  });
});
