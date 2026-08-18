import { describe, expect, it } from 'vitest';
import type { Rule } from '@/types/unified-rules';
import {
  buildConditionTree,
  fromContentRuleUiAction,
  resolveContentRulesRule,
  toContentRuleUiAction,
} from './content-rules';

describe('content rules demo contract mapping', () => {
  it('maps the six product actions onto unified-rule actions', () => {
    expect(fromContentRuleUiAction('deliver')).toBe('accept');
    expect(fromContentRuleUiAction('tag_deliver')).toBe('accept');
    expect(fromContentRuleUiAction('isolate')).toBe('quarantine');
    expect(fromContentRuleUiAction('review')).toBe('audit');
    expect(fromContentRuleUiAction('block')).toBe('reject');
    expect(fromContentRuleUiAction('discard')).toBe('discard');
  });

  it('distinguishes plain delivery from header-tagged delivery', () => {
    expect(toContentRuleUiAction('accept')).toBe('deliver');
    expect(toContentRuleUiAction('accept', {
      add_headers: [{ name: 'X-OSG-Content-Tag', value: 'sensitive' }],
      notify_admin: false,
      notify_sender: false,
    })).toBe('tag_deliver');
  });

  it('builds one content-group node regardless of selected display scopes', () => {
    const tree = buildConditionTree({
      match_type: 'content_group',
      match_content: 'finance',
      scopes: ['subject', 'header'],
      directions: { receive: { enabled: true, action: 'audit' } },
    });
    expect(tree.children?.[1]).toEqual({
      type: 'condition',
      field: 'rcpttags',
      operator: 'hasTag',
      value: 'grp:finance',
    });
  });
});

// GT-12781: 后端 serializeRuleToMap 用 json.RawMessage 内联下发 metadata/condition_tree，
// 真实 API 返回的是**对象**，裸 JSON.parse 会抛错并让规则被误判为「复杂条件」。
// 下面的 fixture 照抄 dev 栈实测的规则 4055（tenant 581）。
const METADATA_OBJECT = {
  directions: { receive: { action: 'quarantine', enabled: true } },
  feature: 'content_rules',
  match_content: 'probe12781',
  match_type: 'keyword',
  scopes: ['subject'],
};

const CONDITION_TREE_OBJECT = {
  type: 'AND',
  children: [
    { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
    { type: 'condition', field: 'subject', operator: 'contain', value: 'probe12781' },
  ],
};

describe('resolveContentRulesRule tolerates both API payload shapes', () => {
  it('resolves a plain content rule whose metadata/condition_tree arrive as objects', () => {
    const rule = {
      id: 4055,
      name: 'GT12781-probe-普通关键词规则',
      metadata: METADATA_OBJECT,
      condition_tree: CONDITION_TREE_OBJECT,
    } as unknown as Rule;

    const resolved = resolveContentRulesRule(rule);
    expect(resolved).not.toBeNull();
    expect(resolved?.match_type).toBe('keyword');
    expect(resolved?.match_content).toBe('probe12781');
    expect(resolved?.scopes).toEqual(['subject']);
    expect(resolved?.directions.receive?.enabled).toBe(true);
  });

  it('still resolves the legacy string-encoded payload shape', () => {
    const rule = {
      id: 4055,
      name: 'GT12781-probe-普通关键词规则',
      metadata: JSON.stringify(METADATA_OBJECT),
      condition_tree: JSON.stringify(CONDITION_TREE_OBJECT),
    } as unknown as Rule;

    const resolved = resolveContentRulesRule(rule);
    expect(resolved).not.toBeNull();
    expect(resolved?.match_type).toBe('keyword');
  });
});
