import { describe, it, expect, vi } from 'vitest';
import {
  buildConditionTree,
  listSenderFilterGroups,
  parseSenderFilterRule,
  resolveSenderFilterRule,
  testSenderFilterRule,
  normalizeDomain,
} from '@/lib/api/sender-filter';
import type { SenderFilterFormData } from '@/types/sender-filter';
import type { Rule } from '@/types/unified-rules';
import type { ApiRequestFn } from '@/lib/api/client';

describe('buildConditionTree', () => {
  const cases: Array<[string, Pick<SenderFilterFormData, 'sender_config' | 'ip_range'>, unknown]> = [
    ['individual + all', {
      sender_config: { type: 'individual', value: 'a@b.com' },
      ip_range: { type: 'all' },
    }, { type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' }],

    ['domain + single', {
      sender_config: { type: 'domain', value: 'b.com' },
      ip_range: { type: 'single', value: '1.2.3.4' },
    }, {
      type: 'AND',
      children: [
        { type: 'condition', field: 'senderdomain', operator: 'eq', value: 'b.com' },
        { type: 'condition', field: 'client_ip', operator: 'eq', value: '1.2.3.4' },
      ],
    }],

    ['group + range', {
      sender_config: { type: 'group', value: 'fin' },
      ip_range: { type: 'range', value: '10.0.0.0/24' },
    }, {
      type: 'AND',
      children: [
        { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: 'grp:fin' },
        { type: 'condition', field: 'client_ip', operator: 'cidr', value: '10.0.0.0/24' },
      ],
    }],

    ['individual + ipGroup', {
      sender_config: { type: 'individual', value: 'x@y.com' },
      ip_range: { type: 'ipGroup', value: 'trusted' },
    }, {
      type: 'AND',
      children: [
        { type: 'condition', field: 'sender', operator: 'eq', value: 'x@y.com' },
        { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: 'grp:trusted' },
      ],
    }],
  ];

  it.each(cases)('serializes %s', (_name, input, expected) => {
    expect(buildConditionTree(input)).toEqual(expected);
  });

  it.each(cases)('round-trips %s', (_name, input, _expected) => {
    const tree = buildConditionTree(input);
    const parsed = parseSenderFilterRule(tree);
    expect(parsed).not.toBeNull();
    expect(parsed!.sender_config).toEqual(input.sender_config);
    expect(parsed!.ip_range).toEqual(input.ip_range);
  });
});

describe('parseSenderFilterRule', () => {
  it('returns null for unknown shape', () => {
    expect(parseSenderFilterRule({
      type: 'OR', children: [],
    })).toBeNull();
  });
  it('returns null for sender contain operator', () => {
    expect(parseSenderFilterRule({
      type: 'condition', field: 'sender', operator: 'contain', value: 'x',
    })).toBeNull();
  });

  // GT-11688: the list must show the sender even when the backend rewrites
  // the AND's children order or wraps a single sender-only condition in AND.
  it('parses AND with reversed child order (ip then sender)', () => {
    const tree = {
      type: 'AND',
      children: [
        { type: 'condition', field: 'client_ip', operator: 'cidr', value: '10.0.0.0/24' },
        { type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' },
      ],
    };
    const parsed = parseSenderFilterRule(tree as never);
    expect(parsed).not.toBeNull();
    expect(parsed!.sender_config).toEqual({ type: 'individual', value: 'a@b.com' });
    expect(parsed!.ip_range).toEqual({ type: 'range', value: '10.0.0.0/24' });
  });

  it('parses AND wrapping a single sender-only condition', () => {
    const tree = {
      type: 'AND',
      children: [
        { type: 'condition', field: 'senderdomain', operator: 'eq', value: 'example.com' },
      ],
    };
    const parsed = parseSenderFilterRule(tree as never);
    expect(parsed).not.toBeNull();
    expect(parsed!.sender_config).toEqual({ type: 'domain', value: 'example.com' });
    expect(parsed!.ip_range).toEqual({ type: 'all' });
  });
});

describe('normalizeDomain', () => {
  it('strips @', () => expect(normalizeDomain('@example.com')).toBe('example.com'));
  it('strips *@', () => expect(normalizeDomain('*@example.com')).toBe('example.com'));
  it('passes through bare domain', () => expect(normalizeDomain('example.com')).toBe('example.com'));
  it('lowercases', () => expect(normalizeDomain('Example.COM')).toBe('example.com'));
});

describe('resolveSenderFilterRule', () => {
  it('uses metadata when valid', () => {
    const rule = {
      id: 1, name: 'test', rule_class: 'action' as const, stage: 'rcpt' as const, priority: 500,
      condition_tree: '{"type":"condition","field":"sender","operator":"eq","value":"a@b.com"}',
      action: 'accept', is_active: true, created_at: '', updated_at: '',
      metadata: JSON.stringify({
        feature: 'sender_filter',
        list_type: 'whitelist',
        sender_config: { type: 'individual', value: 'a@b.com' },
        ip_range: { type: 'all' },
      }),
      tags: [],
    } as Rule;
    const result = resolveSenderFilterRule(rule);
    expect(result).not.toBeNull();
    expect(result!.list_type).toBe('whitelist');
  });

  it('accepts object-shaped API fields when opening an existing rule', () => {
    const rule = {
      id: 1, name: 'saved sender blacklist', rule_class: 'action' as const, stage: 'rcpt' as const, priority: 500,
      condition_tree: {
        type: 'condition', field: 'sender', operator: 'eq', value: 'spam@x.com',
      },
      action: 'reject', is_active: true, created_at: '', updated_at: '',
      metadata: {
        feature: 'sender_filter',
        list_type: 'blacklist',
        sender_config: { type: 'individual', value: 'spam@x.com' },
        ip_range: { type: 'all' },
      },
    } as unknown as Rule;

    expect(resolveSenderFilterRule(rule)).toMatchObject({
      list_type: 'blacklist',
      sender_config: { type: 'individual', value: 'spam@x.com' },
      ip_range: { type: 'all' },
    });
  });

  it('falls back to condition_tree when metadata missing', () => {
    const rule = {
      id: 1, name: 'test', rule_class: 'action' as const, stage: 'rcpt' as const, priority: 500,
      condition_tree: '{"type":"condition","field":"sender","operator":"eq","value":"spam@x.com"}',
      action: 'reject', is_active: true, created_at: '', updated_at: '',
      tags: [],
    } as Rule;
    const result = resolveSenderFilterRule(rule);
    expect(result).not.toBeNull();
    expect(result!.list_type).toBe('blacklist');
    expect(result!.sender_config.type).toBe('individual');
    expect(result!.sender_config.value).toBe('spam@x.com');
  });

  it('returns null when both fail', () => {
    const rule = {
      id: 1, name: 'test', rule_class: 'action' as const, stage: 'rcpt' as const, priority: 500,
      condition_tree: '{"type":"OR","children":[]}',
      action: 'reject', is_active: true, created_at: '', updated_at: '',
    } as Rule;
    expect(resolveSenderFilterRule(rule)).toBeNull();
  });
});

describe('sender filter API helpers', () => {
  it('lists sender and IP groups from unified rule group page', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      items: [
        { id: 1, name: 'sender group', stage: 'mail', rule_class: 'tag', tags: ['grp:fin'], condition_tree: '{}', is_active: true, created_at: '', updated_at: '', metadata: JSON.stringify({ group_type: 'sender' }), member_count: 2 },
        { id: 2, name: 'ip group', stage: 'onconnect', rule_class: 'tag', tags: ['grp:trusted-ip'], condition_tree: '{}', is_active: true, created_at: '', updated_at: '', metadata: JSON.stringify({ group_type: 'ip' }), member_count: 3 },
        { id: 3, name: 'recipient group', stage: 'rcpt', rule_class: 'tag', tags: ['grp:rcpt'], condition_tree: '{}', is_active: true, created_at: '', updated_at: '', metadata: JSON.stringify({ group_type: 'recipient' }) },
      ],
    });

    const result = await listSenderFilterGroups(requestFn as ApiRequestFn);

    expect(requestFn).toHaveBeenCalledWith('/unified-rules?rule_class=tag&page=groups&include=member_count%2Creference_count');
    expect(result.senderGroups.map((g) => g.name)).toEqual(['fin']);
    expect(result.ipGroups.map((g) => g.name)).toEqual(['trusted-ip']);
    expect(result.senderGroups[0].memberCount).toBe(2);
  });

  it('posts simulation requests to unified rule test API', async () => {
    const requestFn = vi.fn().mockResolvedValue({ matched: true, evaluated_conditions: [] });
    const conditionTree = buildConditionTree({
      sender_config: { type: 'domain', value: 'example.com' },
      ip_range: { type: 'range', value: '10.0.0.0/24' },
    });

    const result = await testSenderFilterRule(conditionTree, { sender: 'a@example.com', senderdomain: 'example.com', client_ip: '10.0.0.5' }, requestFn as ApiRequestFn);

    expect(result.matched).toBe(true);
    expect(requestFn).toHaveBeenCalledWith('/unified-rules/test', {
      method: 'POST',
      body: {
        condition_tree: conditionTree,
        test_attributes: { sender: 'a@example.com', senderdomain: 'example.com', client_ip: '10.0.0.5' },
      },
    });
  });
});
