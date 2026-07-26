import { describe, it, expect } from 'vitest';
import { ruleToGroup } from './groups';
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
