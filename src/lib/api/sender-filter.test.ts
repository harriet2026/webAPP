import { describe, it, expect } from 'vitest';
import { formatListId, buildConditionTree, resolveSenderFilterRule } from './sender-filter';
import type { Rule } from '@/types/unified-rules';

const baseRule = (over: Partial<Rule> = {}): Rule => ({
  id: 1, name: 'r', rule_class: 'action', stage: 'rcpt', priority: 500,
  condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' }),
  action: 'reject', is_active: true, created_at: '2026-03-20T10:30:00Z', updated_at: '2026-03-20T10:30:00Z',
  ...over,
} as Rule);

describe('formatListId', () => {
  it('黑名单用 BL 前缀 + created_at 日期 + 补零 id', () => {
    expect(formatListId(baseRule({ id: 1 }), 'blacklist')).toBe('BL-20260320-001');
  });
  it('白名单用 WL 前缀', () => {
    expect(formatListId(baseRule({ id: 42, action: 'accept' }), 'whitelist')).toBe('WL-20260320-042');
  });
});

describe('condition_tree 不回归', () => {
  it('individual → sender eq', () => {
    const t = buildConditionTree({ sender_config: { type: 'individual', value: 'x@y.com' }, ip_range: { type: 'all' } });
    expect(t).toEqual({ type: 'condition', field: 'sender', operator: 'eq', value: 'x@y.com' });
  });
  it('白名单规则可从 sys:nocontent 标签反解析 whitelist_mode', () => {
    const bypassMeta = resolveSenderFilterRule(baseRule({ action: 'accept', tags: ['sys:nocontent'] }));
    const directMeta = resolveSenderFilterRule(baseRule({ action: 'accept', tags: [] }));
    expect(bypassMeta?.whitelist_mode).toBe('bypass_content');
    expect(directMeta?.whitelist_mode).toBe('direct_deliver');
  });
});

describe('resolveSenderFilterRule with incomplete metadata', () => {
  // POST /unified-rules accepts a sender_filter rule whose metadata is just
  // {"feature":"sender_filter"} (rule import and non-UI clients produce this).
  // resolveSenderFilterRule used to read metadata.sender_config.type unguarded,
  // throwing "Cannot read properties of undefined (reading 'type')" during
  // SenderFilterPage's render — the error boundary then replaced the WHOLE page.
  it('does not throw when metadata lacks sender_config / ip_range', () => {
    const rule = baseRule({ metadata: JSON.stringify({ feature: 'sender_filter' }) });
    expect(() => resolveSenderFilterRule(rule)).not.toThrow();
  });

  it('falls back to the condition-tree derivation instead of returning null', () => {
    // The tree still describes the rule, so the caller should get a usable shape
    // rather than losing the row to the "complex condition" fallback.
    const rule = baseRule({ metadata: JSON.stringify({ feature: 'sender_filter' }) });
    const resolved = resolveSenderFilterRule(rule);
    expect(resolved).not.toBeNull();
    expect(resolved!.sender_config.type).toBe('individual');
    expect(resolved!.sender_config.value).toBe('a@b.com');
  });
});

// GT-11721: 状态筛选逻辑提取为纯函数（列表筛选 = tab + 搜索 + 状态 组合）
describe('filterSenderFilterRules (GT-11721 状态筛选)', () => {
  const view = (over: Partial<Rule> = {}, listType: 'blacklist' | 'whitelist' = 'blacklist') => {
    const rule = baseRule(over);
    return {
      rule,
      list_type: listType,
      list_id_display: formatListId(rule, listType),
      resolved: resolveSenderFilterRule(rule),
      is_complex: false,
    };
  };

  it('status=enabled 只保留启用规则', async () => {
    const { filterSenderFilterRules } = await import('./sender-filter');
    const items = [view({ id: 1, name: 'on', is_active: true }), view({ id: 2, name: 'off', is_active: false })];
    const out = filterSenderFilterRules(items, { listType: 'blacklist', search: '', status: 'enabled' });
    expect(out.map((v) => v.rule.name)).toEqual(['on']);
  });

  it('status=disabled 只保留禁用规则', async () => {
    const { filterSenderFilterRules } = await import('./sender-filter');
    const items = [view({ id: 1, name: 'on', is_active: true }), view({ id: 2, name: 'off', is_active: false })];
    const out = filterSenderFilterRules(items, { listType: 'blacklist', search: '', status: 'disabled' });
    expect(out.map((v) => v.rule.name)).toEqual(['off']);
  });

  it('status=all 不过滤，且与搜索、tab 组合生效', async () => {
    const { filterSenderFilterRules } = await import('./sender-filter');
    const items = [
      view({ id: 1, name: 'alpha-on', is_active: true }),
      view({ id: 2, name: 'alpha-off', is_active: false }),
      view({ id: 3, name: 'beta-on', is_active: true }),
      view({ id: 4, name: 'wl-alpha', action: 'accept', is_active: true }, 'whitelist'),
    ];
    expect(filterSenderFilterRules(items, { listType: 'blacklist', search: '', status: 'all' })).toHaveLength(3);
    const combined = filterSenderFilterRules(items, { listType: 'blacklist', search: 'alpha', status: 'enabled' });
    expect(combined.map((v) => v.rule.name)).toEqual(['alpha-on']);
  });

  it('搜索仍覆盖复杂规则的原始条件树', async () => {
    const { filterSenderFilterRules } = await import('./sender-filter');
    const complex = {
      ...view({ id: 9, name: 'cx' }),
      resolved: null,
      is_complex: true,
    };
    const out = filterSenderFilterRules([complex], { listType: 'blacklist', search: 'a@b.com', status: 'all' });
    expect(out).toHaveLength(1);
  });
});
