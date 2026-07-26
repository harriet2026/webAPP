import { describe, it, expect } from 'vitest';
import { mockUserListRulesList } from './fixtures';
import { resolveUserListRule } from '@/lib/api/user-list';

describe('mockUserListRulesList', () => {
  const items = mockUserListRulesList().items;
  it('has 21 blacklist (20 demo + 1 block) and 15 whitelist rules', () => {
    const bl = items.filter((r) => r.metadata?.includes('"list_type":"blacklist"'));
    const wl = items.filter((r) => r.metadata?.includes('"list_type":"whitelist"'));
    expect(bl.length).toBe(21);
    expect(wl.length).toBe(15);
  });
  it('first blacklist row matches demo UB-20260320-001 / spam@bad-actor.com / alice@company.com', () => {
    const first = items[0];
    const v = resolveUserListRule(first, 'blacklist');
    expect(v.ruleId).toBe('UB-20260320-001');
    expect(v.sender).toBe('spam@bad-actor.com');
    expect(v.recipient).toBe('alice@company.com');
    expect(v.createdBy).toBe('admin@company.com');
  });
  it('contains exactly one block (reject) row for red-badge coverage', () => {
    expect(items.filter((r) => r.action === 'reject').length).toBe(1);
  });
});
