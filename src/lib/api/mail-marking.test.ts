import { describe, expect, it } from 'vitest';
import { saveMailMarkingRule, testMailMarkingRule } from './mail-marking';
import type { ApiRequestFn } from './client';

describe('saveMailMarkingRule', () => {
  it('persists mail marking as the native non-terminal proceed action', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const requestFn: ApiRequestFn = async <T>(_path: string, options?: Parameters<ApiRequestFn>[1]) => {
      sentBody = options?.body as Record<string, unknown>;
      return {
        id: 1,
        name: sentBody.name,
        priority: sentBody.priority,
        is_active: sentBody.is_active,
        metadata: sentBody.metadata,
        condition_tree: sentBody.condition_tree
      } as T;
    };

    await saveMailMarkingRule(
      {
        name: '外站标记',
        priority: 100,
        is_active: true,
        metadata: {
          feature: 'mail_marking',
          direction: 'receive',
          mark: { text: '【外站】', positions: ['subject_prefix'], style: 'plain_text' }
        },
        departments: [],
        groups: []
      },
      requestFn
    );

    expect(sentBody?.action).toBe('proceed');
  });
});

describe('testMailMarkingRule', () => {
  it('sends the tested address without fabricating membership from the rule scopes', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const requestFn: ApiRequestFn = async <T>(_path: string, options?: Parameters<ApiRequestFn>[1]) => {
      sentBody = options?.body as Record<string, unknown>;
      return { matched: false } as T;
    };

    const result = await testMailMarkingRule(
      {
        name: '财务邮件标记',
        priority: 100,
        is_active: true,
        metadata: {
          feature: 'mail_marking',
          direction: 'receive',
          mark: { text: '【财务】', positions: ['subject_prefix'], style: 'plain_text' },
        },
        departments: ['finance'],
        groups: ['vip'],
      },
      'outsider@example.test',
      requestFn,
    );

    const attributes = sentBody?.test_attributes as Record<string, unknown>;
    expect(attributes.recipients).toBe('outsider@example.test');
    expect(attributes.recipient_group).toBeUndefined();
    expect(attributes.sender_group).toBeUndefined();
    expect(result).toEqual({ matched: false, ruleName: undefined });
  });
});
