import { describe, it, expect } from 'vitest';
import { ruleToGroup, serializeMembers, parseContentGroupScopes } from './groups';
import type { Rule } from '@/types/unified-rules';

describe('feature group parsing', () => {
  it('parses a feature group rule', () => {
    const rule = {
      id: 1, name: 'vipfeat', stage: 'data', is_active: true,
      tags: ['grp:vipfeat'], metadata: JSON.stringify({ group_type: 'feature' }),
      condition_tree: JSON.stringify({ type: 'OR', children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'x' }] }),
      created_at: '', updated_at: '',
    } as unknown as Rule;
    const g = ruleToGroup(rule);
    expect(g?.type).toBe('feature');
  });
});

// GT-12802：内容组定义携带 scopes，决定关键词匹配哪几个字段。
describe('content group scopes (GT-12802)', () => {
  it('serializeMembers defaults to subject/text_body/html_body for content', () => {
    const tree = serializeMembers('content', ['kw1']);
    const scopes = parseContentGroupScopes(tree);
    expect(scopes).toEqual(['subject', 'text_body', 'html_body']);
  });

  it('serializeMembers honors narrowed scopes', () => {
    const tree = serializeMembers('content', ['kw1', 'kw2'], ['subject', 'header']);
    const scopes = parseContentGroupScopes(tree);
    expect(scopes).toEqual(['subject', 'header']);
  });

  it('ruleToGroup parses scopes back from a scoped content tree', () => {
    const rule = {
      id: 2, name: 'fin', stage: 'data', is_active: true,
      tags: ['grp:fin'], metadata: JSON.stringify({ group_type: 'content' }),
      condition_tree: JSON.stringify({
        type: 'OR',
        children: [
          { type: 'OR', children: [
            { type: 'condition', field: 'subject', operator: 'contain', value: 'invoice' },
            { type: 'condition', field: 'header', operator: 'contain', value: 'invoice' },
          ] },
        ],
      }),
      created_at: '', updated_at: '',
    } as unknown as Rule;
    const g = ruleToGroup(rule);
    expect(g?.type).toBe('content');
    expect(g?.members).toEqual(['invoice']);
    expect(g?.scopes).toEqual(['subject', 'header']);
  });

  it('ruleToGroup keeps empty scopes for non-content types', () => {
    const rule = {
      id: 3, name: 'sgrp', stage: 'mail', is_active: true,
      tags: ['grp:sgrp'], metadata: JSON.stringify({ group_type: 'sender' }),
      condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'within', value: 'a@example.com' }),
      created_at: '', updated_at: '',
    } as unknown as Rule;
    const g = ruleToGroup(rule);
    expect(g?.type).toBe('sender');
    expect(g?.scopes).toBeUndefined();
  });
});
