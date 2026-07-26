import { describe, expect, it } from 'vitest';
import {
  buildConditionTree,
  fromContentRuleUiAction,
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
