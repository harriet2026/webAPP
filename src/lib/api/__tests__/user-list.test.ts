import { describe, it, expect, vi } from 'vitest';
import { resolveUserListRule, formatUserListId, bulkDeleteUserListRules, listUserListRules, userListTypeFromRule } from '../user-list';
import type { Rule } from '@/types/unified-rules';

const rule = (o: Partial<Rule>): Rule => ({
  id: 7, name: 'r', rule_class: 'action', stage: 'rcpt', priority: 2000,
  condition_tree: JSON.stringify({ type: 'AND', children: [
    { type: 'condition', field: 'sender', operator: 'eq', value: 'spam@bad-actor.com' },
    { type: 'condition', field: 'onercpt', operator: 'eq', value: 'alice@company.com' },
  ]}),
  action: 'quarantine', is_active: true,
  metadata: JSON.stringify({ feature: 'user_list', owner: 'admin@company.com', source: 'admin', list_type: 'blacklist' }),
  created_at: '2026-03-20T10:30:00Z', updated_at: '2026-03-20T10:30:00Z', ...o,
});

describe('user-list api', () => {
  it('resolves sender/recipient/action/owner from a blacklist rule', () => {
    const v = resolveUserListRule(rule({}), 'blacklist');
    expect(v.sender).toBe('spam@bad-actor.com');
    expect(v.recipient).toBe('alice@company.com');
    expect(v.action).toBe('quarantine');
    expect(v.createdBy).toBe('admin@company.com');
    expect(v.status).toBe('enabled');
  });
  it('accepts decoded condition_tree and metadata objects from the list API', () => {
    const objectRule = rule({
      condition_tree: {
        type: 'AND', children: [
          { type: 'condition', field: 'sender', operator: 'eq', value: 'spam@bad-actor.com' },
          { type: 'condition', field: 'onercpt', operator: 'eq', value: 'alice@company.com' },
        ],
      } as unknown as string,
      metadata: {
        feature: 'user_list', owner: 'admin@company.com', source: 'admin', list_type: 'blacklist',
      } as unknown as string,
    });
    const v = resolveUserListRule(objectRule, 'blacklist');

    expect(v.sender).toBe('spam@bad-actor.com');
    expect(v.recipient).toBe('alice@company.com');
    expect(v.createdBy).toBe('admin@company.com');
    expect(userListTypeFromRule(objectRule)).toBe('blacklist');
  });
  it('maps accept action to whitelist "whitelist" view', () => {
    const v = resolveUserListRule(rule({ action: 'accept' }), 'whitelist');
    expect(v.action).toBe('whitelist');
  });
  it('maps reject action to block', () => {
    expect(resolveUserListRule(rule({ action: 'reject' }), 'blacklist').action).toBe('block');
  });
  it('formats UB-/UW- ids padded to 3', () => {
    expect(formatUserListId(rule({ id: 3 }), 'blacklist')).toBe('UB-20260320-003');
    expect(formatUserListId(rule({ id: 12 }), 'whitelist')).toBe('UW-20260320-012');
  });
  it('passes list type, keyword and pagination to the server list contract', async () => {
    const fn = vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, page_size: 20 });
    const result = await listUserListRules({ listType: 'blacklist', search: 'Alice', page: 2, pageSize: 20 }, fn as never);
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('rule_page=user_list'));
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('list_type=blacklist'));
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('search=Alice'));
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('page_size=20'));
    expect(result).toMatchObject({ total: 0, page: 2, pageSize: 20, serverPaginated: true });
  });
  it('bulk delete posts to /unified-rules/bulk with action=delete and returns deleted/failed', async () => {
    const fn = vi.fn().mockResolvedValue({ deleted: [1], failed: [{ id: 2, reason: 'x' }] });
    const r = await bulkDeleteUserListRules([1, 2], fn as never);
    expect(fn).toHaveBeenCalledWith('/unified-rules/bulk', expect.objectContaining({ method: 'POST' }));
    expect(fn.mock.calls[0][1].body).toMatchObject({ action: 'delete', page: 'user_list', ids: [1, 2] });
    expect(r.deleted).toEqual([1]); expect(r.failed[0].id).toBe(2);
  });
});
