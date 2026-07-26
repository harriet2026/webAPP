import { describe, expect, it } from 'vitest';
import {
  listMailMarkingRules,
  listMailMarkingScopes,
  saveMailMarkingRule,
  testMailMarkingRule,
  type SaveMailMarkingPayload,
} from '@/lib/api/mail-marking';
import type { ApiRequestFn } from '@/lib/api/client';
import type { RuleNode } from '@/types/unified-rules';

interface CapturedSaveBody {
  metadata: SaveMailMarkingPayload['metadata'];
  condition_tree: RuleNode;
  [key: string]: unknown;
}

interface CapturedDryRunBody {
  condition_tree: RuleNode;
  test_attributes: Record<string, unknown>;
}

const receivePayload: SaveMailMarkingPayload = {
  name: '高管外站警示',
  priority: 401,
  is_active: true,
  departments: ['dept-1'],
  groups: ['grp-3'],
  metadata: {
    feature: 'mail_marking', direction: 'receive', departments: ['dept-1'], groups: ['grp-3'],
    mark: { text: '【外站邮件】', positions: ['body_top'], style: 'blue_tag' },
  },
};

describe('mail-marking unified-rule contract', () => {
  it('serializes receive scopes as recipient_group map conditions', async () => {
    let capturedPath = '';
    let capturedBody: CapturedSaveBody | null = null;
    const request: ApiRequestFn = async <T>(path: string, options?: { body?: unknown }): Promise<T> => {
      capturedPath = path;
      capturedBody = options?.body as CapturedSaveBody;
      return {
        id: 9001, ...capturedBody,
        metadata: capturedBody.metadata,
        condition_tree: capturedBody.condition_tree,
      } as T;
    };

    const saved = await saveMailMarkingRule(receivePayload, request);
    expect(capturedPath).toBe('/unified-rules?scope=mail_marking');
    expect(capturedBody).not.toBeNull();
    expect((capturedBody as unknown as CapturedSaveBody).condition_tree).toEqual({
      type: 'AND',
      children: [
        { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
        {
          type: 'OR',
          children: [
            { type: 'condition', field: 'recipient_group', map_key: 'grp:dept-1', operator: 'eq', value: 'true' },
            { type: 'condition', field: 'recipient_group', map_key: 'grp:grp-3', operator: 'eq', value: 'true' },
          ],
        },
      ],
    });
    expect(saved.departments).toEqual(['dept-1']);
    expect(saved.groups).toEqual(['grp-3']);
  });

  it('serializes outbound scopes as sender_group and sends map attributes to dry-run', async () => {
    const payload: SaveMailMarkingPayload = {
      name: '销售部声明', priority: 22, is_active: true, departments: ['dept-3'], groups: [],
      metadata: {
        feature: 'mail_marking', direction: 'send', departments: ['dept-3'], groups: [],
        disclaimer: { content: 'notice', positions: ['body_bottom'], format: 'auto' },
      },
    };
    let body: CapturedDryRunBody | null = null;
    const request: ApiRequestFn = async <T>(_path: string, options?: { body?: unknown }): Promise<T> => {
      body = options?.body as CapturedDryRunBody;
      return { matched: true } as T;
    };
    const result = await testMailMarkingRule(payload, 'sales@example.com', request);
    expect((body as unknown as CapturedDryRunBody).condition_tree.children?.[1]).toMatchObject({
      field: 'sender_group', map_key: 'grp:dept-3', operator: 'eq', value: 'true',
    });
    expect((body as unknown as CapturedDryRunBody).test_attributes.sender_group).toEqual({ 'grp:dept-3': true });
    expect(result).toEqual({ matched: true, ruleName: '销售部声明' });
  });

  it('strictly rejects a direction/group-field mismatch instead of falling back to receive', async () => {
    const request: ApiRequestFn = async <T>() => ({ items: [{
      id: 1, name: 'bad', priority: 10, is_active: true,
      metadata: { feature: 'mail_marking', direction: 'receive', departments: [], groups: ['g'] },
      condition_tree: {
        type: 'AND', children: [
          { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
          { type: 'condition', field: 'sender_group', map_key: 'grp:g', operator: 'eq', value: 'true' },
        ],
      },
    }] } as T);
    await expect(listMailMarkingRules('receive', request)).resolves.toEqual([]);
  });

  it('loads department and group options for the selected direction', async () => {
    const request: ApiRequestFn = async <T>() => ({ items: [
      { name: '高管部', tags: ['grp:dept-1'], member_count: 3, metadata: { group_type: 'recipient', mail_marking_scope: 'department' } },
      { name: '全体员工', tags: ['grp:grp-1'], member_count: 20, metadata: { group_type: 'recipient' } },
      { name: '销售部', tags: ['grp:dept-3'], metadata: { group_type: 'sender', mail_marking_scope: 'department' } },
    ] } as T);
    await expect(listMailMarkingScopes('receive', request)).resolves.toEqual([
      { key: 'dept-1', name: '高管部', memberCount: 3, kind: 'department' },
      { key: 'grp-1', name: '全体员工', memberCount: 20, kind: 'group' },
    ]);
  });

  it('sorts higher priorities first and uses id descending as the tiebreaker', async () => {
    const make = (id: number, priority: number) => ({
      id, name: `r${id}`, priority, is_active: true,
      metadata: { feature: 'mail_marking', direction: 'receive', departments: [], groups: [], mark: { text: 'x', positions: ['body_top'], style: 'plain_text' } },
      condition_tree: { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
    });
    const request: ApiRequestFn = async <T>() => ({ items: [make(2, 10), make(3, 20), make(4, 20)] } as T);
    const rules = await listMailMarkingRules('receive', request);
    expect(rules.map((rule) => rule.id)).toEqual([4, 3, 2]);
  });
});
