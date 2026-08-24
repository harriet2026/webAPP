import { describe, expect, it } from 'vitest';
import { saveMailMarkingRule } from './mail-marking';
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
