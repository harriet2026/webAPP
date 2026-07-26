import { describe, expect, it } from 'vitest';
import {
  groupPolicyPriorityRange,
  groupPolicyPriorityOutOfRange,
  selectableTargetGroups,
} from '@/lib/api/group-policy';
import type { Rule } from '@/types/unified-rules';
import type { Group } from '@/types/groups';

describe('groupPolicyPriorityRange (GT-12276)', () => {
  it('租户管理员收窄为 100-1000（与服务端 validatePriority 同口径）', () => {
    expect(groupPolicyPriorityRange(false)).toEqual({ min: 100, max: 1000 });
  });
  it('平台管理员为项目全局 0-9999', () => {
    expect(groupPolicyPriorityRange(true)).toEqual({ min: 0, max: 9999 });
  });
  it('越界判定按角色范围生效', () => {
    // 租户管理员：UI 旧行为允许 0-9999，但服务端只收 100-1000 —— 0 和 2000 必须判越界
    expect(groupPolicyPriorityOutOfRange(0, false)).toBe(true);
    expect(groupPolicyPriorityOutOfRange(99, false)).toBe(true);
    expect(groupPolicyPriorityOutOfRange(100, false)).toBe(false);
    expect(groupPolicyPriorityOutOfRange(1000, false)).toBe(false);
    expect(groupPolicyPriorityOutOfRange(1001, false)).toBe(true);
    // 平台管理员
    expect(groupPolicyPriorityOutOfRange(0, true)).toBe(false);
    expect(groupPolicyPriorityOutOfRange(9999, true)).toBe(false);
    expect(groupPolicyPriorityOutOfRange(10000, true)).toBe(true);
  });
});

describe('selectableTargetGroups (GT-12273)', () => {
  const mkGroup = (name: string, isActive: boolean): Group =>
    ({
      ruleId: 1,
      name,
      type: 'recipient',
      members: [],
      memberCount: 0,
      referenceCount: 0,
      isActive,
    }) as unknown as Group;

  it('过滤 is_active=false 的失效群组（选中后保存必然 400）', () => {
    const rules = [{ id: 1 }, { id: 2 }, { id: 3 }] as unknown as Rule[];
    const byId: Record<number, Group | null> = {
      1: mkGroup('active-a', true),
      2: mkGroup('disabled-b', false),
      3: null, // 非群组行
    };
    const out = selectableTargetGroups(rules, (r) => byId[(r as { id: number }).id]);
    expect(out.map((g) => g.name)).toEqual(['active-a']);
  });
});
