import { describe, it, expect } from 'vitest';
import {
  behaviorControlSchema,
  createBehaviorControlSchema,
  getBehaviorControlPriorityRange,
} from './schema';

const base = {
  name: 'r', description: '', priority: 2000, is_active: true,
  direction: 'outbound' as const, object_config: { type: 'global' as const },
  time_window: '15min' as const, dim_a: 'ip_count' as const, threshold_a: 5,
  or_enabled: false, action: 'review' as const,
};

describe('behaviorControlSchema', () => {
  it('accepts a minimal valid global rule', () => {
    expect(behaviorControlSchema.safeParse(base).success).toBe(true);
  });
  it('rejects empty name with nameRequired', () => {
    const r = behaviorControlSchema.safeParse({ ...base, name: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'nameRequired')).toBe(true);
  });
  it('uses the API tenant range and default for tenant administrators', () => {
    const range = getBehaviorControlPriorityRange(false);
    const tenantSchema = createBehaviorControlSchema(range);

    expect(range).toEqual({ min: 100, max: 1000, defaultValue: 600 });
    expect(tenantSchema.safeParse({ ...base, priority: 99 }).success).toBe(false);
    expect(tenantSchema.safeParse({ ...base, priority: 100 }).success).toBe(true);
    expect(tenantSchema.safeParse({ ...base, priority: 600 }).success).toBe(true);
    expect(tenantSchema.safeParse({ ...base, priority: 1000 }).success).toBe(true);
    expect(tenantSchema.safeParse({ ...base, priority: 1001 }).success).toBe(false);
  });
  it('keeps the API system-administrator range available', () => {
    const range = getBehaviorControlPriorityRange(true);
    const systemSchema = createBehaviorControlSchema(range);

    expect(range).toEqual({ min: 0, max: 9999, defaultValue: 600 });
    expect(systemSchema.safeParse({ ...base, priority: 0 }).success).toBe(true);
    expect(systemSchema.safeParse({ ...base, priority: 9999 }).success).toBe(true);
    expect(systemSchema.safeParse({ ...base, priority: 10000 }).success).toBe(false);
  });
  it('rejects thresholdA <= 0', () => {
    expect(behaviorControlSchema.safeParse({ ...base, threshold_a: 0 }).success).toBe(false);
  });
  it('individual email must match wildcard-capable pattern', () => {
    const ok = { ...base, object_config: { type: 'sender', sub_type: 'individual', value: '*@corp.com' } };
    const bad = { ...base, object_config: { type: 'sender', sub_type: 'individual', value: 'notemail' } };
    expect(behaviorControlSchema.safeParse(ok).success).toBe(true);
    expect(behaviorControlSchema.safeParse(bad).success).toBe(false);
  });
  it('senderIp single accepts ip and cidr', () => {
    expect(behaviorControlSchema.safeParse({ ...base, object_config: { type: 'senderIp', sub_type: 'single', value: '1.2.3.0/24' } }).success).toBe(true);
    expect(behaviorControlSchema.safeParse({ ...base, object_config: { type: 'senderIp', sub_type: 'single', value: 'x' } }).success).toBe(false);
  });
  it('rejects the unsupported organization sender subtype', () => {
    expect(behaviorControlSchema.safeParse({ ...base, object_config: { type: 'sender', sub_type: 'organization', value: 'engineering' } }).success).toBe(false);
  });
  it('OR enabled requires thresholdB > 0', () => {
    expect(behaviorControlSchema.safeParse({ ...base, or_enabled: true, dim_b: 'mail_count', threshold_b: 0 }).success).toBe(false);
    expect(behaviorControlSchema.safeParse({ ...base, or_enabled: true, dim_b: 'mail_count', threshold_b: 10 }).success).toBe(true);
  });
});
