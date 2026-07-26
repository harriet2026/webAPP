import { describe, it, expect } from 'vitest';
import { mockBehaviorControlRulesList, mockBehaviorControlGroupsList } from './fixtures';
import { resolveBehaviorControlRule } from '@/lib/api/behavior-control';

describe('behavior-control mock fixtures', () => {
  it('lists 35 rules', () => {
    expect(mockBehaviorControlRulesList().items).toHaveLength(35);
  });
  it('rule-3 is an outbound sales group with OR', () => {
    const r = mockBehaviorControlRulesList().items.find((x) => x.name === '销售团队外发限制')!;
    const v = resolveBehaviorControlRule(r);
    expect(v.meta?.direction).toBe('outbound');
    expect(v.meta?.object_config).toMatchObject({ type: 'sender', sub_type: 'group', value: '销售团队' });
    expect(v.meta?.or_enabled).toBe(true);
  });
  it('does not expose the unsupported organization sender subtype', () => {
    const subTypes = mockBehaviorControlRulesList().items.map(
      (rule) => resolveBehaviorControlRule(rule).meta?.object_config.sub_type,
    );
    expect(subTypes).not.toContain('organization');
  });
  it('rule-10 (generated, i%5===0) is disabled', () => {
    const r = mockBehaviorControlRulesList().items.find((x) => x.id === 10)!;
    expect(r.is_active).toBe(false);
  });
  it('exposes sender/ip/org groups', () => {
    const items = mockBehaviorControlGroupsList().items;
    const types = new Set(items.map((r) => JSON.parse(r.metadata!).group_type));
    expect(types).toEqual(new Set(['sender', 'ip', 'org']));
  });
});
