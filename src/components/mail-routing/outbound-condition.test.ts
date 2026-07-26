import { describe, it, expect } from 'vitest';
import type { RuleNode } from '@/types/unified-rules';
import { injectIsOutbound, stripIsOutbound, IS_OUTBOUND_NODE } from './outbound-condition';

const cond = (field: string, value = 'x'): RuleNode => ({
  type: 'condition',
  field,
  operator: 'eq',
  value,
});

const isOutboundChildIndex = (node: RuleNode): number =>
  (node.children ?? []).findIndex((c) => c.type === 'condition' && c.field === 'is_outbound');

describe('injectIsOutbound', () => {
  it('prepends is_outbound to an AND root', () => {
    const tree: RuleNode = { type: 'AND', children: [cond('senderdomain')] };
    const out = injectIsOutbound(tree);
    expect(out.type).toBe('AND');
    expect(out.children?.[0]).toEqual(IS_OUTBOUND_NODE);
    expect(out.children).toHaveLength(2);
  });

  it('wraps an OR root in a new AND so is_outbound is an unconditional constraint (review M3)', () => {
    // The bug: injecting is_outbound as a disjunct of an OR root makes the rule
    // match every outbound mail. is_outbound must be ANDed, never ORed.
    const tree: RuleNode = { type: 'OR', children: [cond('senderdomain', 'a.com'), cond('senderdomain', 'b.com')] };
    const out = injectIsOutbound(tree);
    expect(out.type).toBe('AND');
    // The OR must NOT have is_outbound spliced into it as a disjunct.
    expect(isOutboundChildIndex(out)).toBe(0);
    const orChild = (out.children ?? []).find((c) => c.type === 'OR') as RuleNode;
    expect(orChild).toBeDefined();
    expect(isOutboundChildIndex(orChild)).toBe(-1);
    expect(orChild.children).toHaveLength(2);
  });

  it('wraps a bare condition root in an AND', () => {
    const out = injectIsOutbound(cond('senderdomain'));
    expect(out.type).toBe('AND');
    expect(out.children?.[0]).toEqual(IS_OUTBOUND_NODE);
    expect(out.children).toHaveLength(2);
  });

  it('is idempotent — re-injecting does not duplicate is_outbound', () => {
    const tree: RuleNode = { type: 'AND', children: [cond('senderdomain')] };
    const once = injectIsOutbound(tree);
    const twice = injectIsOutbound(once);
    const count = (twice.children ?? []).filter((c) => c.type === 'condition' && c.field === 'is_outbound').length;
    expect(count).toBe(1);
  });
});

describe('strip/inject round-trip', () => {
  it('restores an OR root for editing after inject (no redundant AND wrapper)', () => {
    const original: RuleNode = { type: 'OR', children: [cond('senderdomain', 'a.com'), cond('recipient', 'x@y')] };
    const injected = injectIsOutbound(original);
    const restored = stripIsOutbound(injected);
    expect(restored).toEqual(original);
  });

  it('restores an AND root with its user conditions', () => {
    const original: RuleNode = { type: 'AND', children: [cond('senderdomain', 'a.com'), cond('client_ip', '1.2.3.4')] };
    const restored = stripIsOutbound(injectIsOutbound(original));
    expect(restored).toEqual(original);
  });
});
