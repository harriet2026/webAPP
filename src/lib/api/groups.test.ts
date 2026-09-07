import { describe, it, expect } from 'vitest';
import { ruleToGroup, serializeMembers, parseContentGroupScopes, importResultRows } from './groups';
import type { Rule } from '@/types/unified-rules';
import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import zh from '@/../messages/zh.json';

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

describe('group member import accounting (GT-13212)', () => {
  it('keeps imported, skipped, and failed rows in an auditable line order', () => {
    expect(importResultRows({
      imported: 0,
      skipped: [
        { line: 1, value: '10.0.0.0/8', reason: 'already_exists' },
        { line: 2, value: '192.168.0.0/16', reason: 'already_exists' },
      ],
      failed: [{ line: 3, value: '3.3.3', reason: 'invalid IP/CIDR: 3.3.3' }],
    })).toEqual([
      { status: 'skipped', line: 1, value: '10.0.0.0/8', reason: 'already_exists' },
      { status: 'skipped', line: 2, value: '192.168.0.0/16', reason: 'already_exists' },
      { status: 'failed', line: 3, value: '3.3.3', reason: 'invalid IP/CIDR: 3.3.3' },
    ]);
  });

  it.each([en, ru, th, zh])('provides all result-summary labels in every locale', messages => {
    expect(messages.groups).toMatchObject({
      importSummary: expect.any(String),
      importResultsTitle: expect.any(String),
      importResultStatus: expect.any(String),
      importResultSkipped: expect.any(String),
      importResultFailed: expect.any(String),
      importResultReason: expect.any(String),
      importSkipAlreadyExists: expect.any(String),
    });
  });
});
