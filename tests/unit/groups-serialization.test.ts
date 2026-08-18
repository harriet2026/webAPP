import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildRulePayload, parseMembers, ruleToGroup, serializeMembers } from '../../src/lib/api/groups';
import { isValidAddressMember, isValidIPOrCIDR } from '../../src/lib/api/group-validation';
import type { GroupType } from '../../src/types/groups';
import type { RuleNode } from '../../src/types/unified-rules';
import type { Rule } from '../../src/types/unified-rules';

interface FixtureCase {
  name: string;
  type: GroupType;
  members: string[];
  tree: RuleNode;
}

const fixturePath = path.resolve(__dirname, '../../../tests/fixtures/groups/condition_trees.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as { cases: FixtureCase[] };

describe('groups condition_tree fixture round-trip', () => {
  for (const c of fixture.cases) {
    it(`parses ${c.name}`, () => {
      expect(parseMembers(c.tree, c.type)).toEqual(c.members);
    });
  }
});

describe('serializeMembers shapes', () => {
  it('ip pure-ip uses single within', () => {
    const tree = serializeMembers('ip', ['1.2.3.4', '5.6.7.8']);
    expect(tree).toEqual({
      type: 'condition', field: 'client_ip', operator: 'within', value: '1.2.3.4\n5.6.7.8',
    });
  });
  it('ip with cidr uses OR of cidr', () => {
    const tree = serializeMembers('ip', ['1.2.3.4', '10.0.0.0/8']);
    expect(tree.type).toBe('OR');
    const children = (tree as { children: RuleNode[] }).children;
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ field: 'client_ip', operator: 'cidr' });
  });
  it('sender mixed email+domain', () => {
    const tree = serializeMembers('sender', ['alice@a.com', '@b.com', 'c.com']);
    expect(tree.type).toBe('OR');
    const children = (tree as { children: RuleNode[] }).children;
    expect(children).toContainEqual({ type: 'condition', field: 'sender', operator: 'within', value: 'alice@a.com' });
    const domains = children.filter(c => c.field === 'senderdomain').map(c => c.value);
    expect(domains.sort()).toEqual(['b.com', 'c.com']);
  });
  // GT-12802 起单个关键词不再多包一层 OR：只有一个关键词时直接返回该词的
  // 字段 OR，多个关键词才是「关键词 OR（字段 OR）」两层。
  it('content keyword expands to 3-field OR per word', () => {
    const single = serializeMembers('content', ['hello']);
    expect(single.type).toBe('OR');
    expect((single as { children: RuleNode[] }).children.map(c => c.field).sort())
      .toEqual(['html_body', 'subject', 'text_body']);

    const tree = serializeMembers('content', ['hello', 'world']);
    expect(tree.type).toBe('OR');
    const inner = (tree as { children: RuleNode[] }).children[0];
    const innerChildren = (inner as { children: RuleNode[] }).children;
    expect(innerChildren.map(c => c.field).sort()).toEqual(['html_body', 'subject', 'text_body']);
  });
  it('throws on empty members', () => {
    expect(() => serializeMembers('ip', [])).toThrow();
  });
});

describe('parseMembers returns null on broken shapes', () => {
  it('AND tree → null', () => {
    expect(parseMembers({
      type: 'AND',
      children: [
        { type: 'condition', field: 'client_ip', operator: 'cidr', value: '10.0.0.0/8' },
      ],
    }, 'ip')).toBeNull();
  });
  it('mixed unknown operator → null', () => {
    expect(parseMembers({
      type: 'condition', field: 'client_ip', operator: 'eq', value: '1.2.3.4',
    }, 'ip')).toBeNull();
  });

  it('empty single-condition groups → null', () => {
    expect(parseMembers({ type: 'condition', field: 'client_ip', operator: 'within', value: '' }, 'ip')).toBeNull();
    expect(parseMembers({ type: 'condition', field: 'sender', operator: 'within', value: '' }, 'sender')).toBeNull();
    expect(parseMembers({ type: 'condition', field: 'senderdomain', operator: 'suffix', value: '' }, 'sender')).toBeNull();
  });
});

describe('group member validation helpers', () => {
  it('validates IP and CIDR ranges strictly', () => {
    expect(isValidIPOrCIDR('1.2.3.4')).toBe(true);
    expect(isValidIPOrCIDR('10.0.0.0/8')).toBe(true);
    expect(isValidIPOrCIDR('2001:db8::1/64')).toBe(true);
    expect(isValidIPOrCIDR('999.999.999.999')).toBe(false);
    expect(isValidIPOrCIDR('1.2.3.4/99')).toBe(false);
    expect(isValidIPOrCIDR('::::')).toBe(false);
  });

  it('validates sender and recipient members', () => {
    expect(isValidAddressMember('alice@example.com')).toBe(true);
    expect(isValidAddressMember('@example.com')).toBe(true);
    expect(isValidAddressMember('example.com')).toBe(true);
    expect(isValidAddressMember('alice@')).toBe(false);
    expect(isValidAddressMember('@bad')).toBe(false);
    expect(isValidAddressMember('not a domain')).toBe(false);
  });
});

describe('ruleToGroup metadata handling', () => {
  it('uses metadata group_type when stage is changed to a non-group stage', () => {
    const rule = {
      id: 10,
      name: 'vip',
      rule_class: 'tag',
      stage: 'header',
      condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'eq', value: 'alice@x.com' }),
      tags: ['grp:vip'],
      priority: 100,
      is_active: true,
      metadata: JSON.stringify({ group_type: 'sender' }),
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as Rule;

    const group = ruleToGroup(rule);
    expect(group).toMatchObject({ name: 'vip', type: 'sender', memberCount: null });
  });

  it('stores group_type in created rule payload metadata', () => {
    const payload = buildRulePayload({ name: 'vip', type: 'recipient', members: ['boss@x.com'] }, true);
    expect(payload.metadata).toEqual({ group_type: 'recipient' });
  });
});
