import { describe, it, expect } from 'vitest';
import {
  behaviorControlSchema,
  createBehaviorControlSchema,
  getBehaviorControlPriorityRange,
} from './schema';

const base = {
  name: 'r', description: '', priority: 2000, is_active: true,
  direction: 'outbound' as const, object_config: { type: 'global' as const },
  time_window: '15min' as const,
  // GT-12707：检测条件从固定的 dim_a/dim_b 两条改为 conditions 数组（1~4 条），
  // dim_a/threshold_a 等旧字段降级为 API 映射用的可选字段，不再参与前端校验。
  conditions: [{ dim: 'ip_count' as const, threshold: 5 }],
  or_enabled: false, action: 'audit' as const,
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
  it('rejects a condition threshold <= 0', () => {
    expect(behaviorControlSchema.safeParse({ ...base, conditions: [{ dim: 'ip_count', threshold: 0 }] }).success).toBe(false);
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
  it('requires between 1 and 4 conditions', () => {
    const mk = (n: number) => Array.from({ length: n }, () => ({ dim: 'mail_count' as const, threshold: 10 }));
    const empty = behaviorControlSchema.safeParse({ ...base, conditions: [] });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues.some((i) => i.message === 'conditionsMin')).toBe(true);
    expect(behaviorControlSchema.safeParse({ ...base, conditions: mk(4) }).success).toBe(true);
    const tooMany = behaviorControlSchema.safeParse({ ...base, conditions: mk(5) });
    expect(tooMany.success).toBe(false);
    if (!tooMany.success) expect(tooMany.error.issues.some((i) => i.message === 'conditionsMax')).toBe(true);
  });
});
