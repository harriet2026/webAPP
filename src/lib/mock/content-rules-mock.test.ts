import { describe, expect, it } from 'vitest';
import { dispatch, isMockable } from './dispatcher';

const scope = '?scope=content_rules';

describe('content_rules mock routes', () => {
  it('scopes list and write routes without intercepting unrelated unified-rule creates', () => {
    expect(isMockable('GET', '/unified-rules?rule_page=content_rules&page=1&page_size=10')).toBe(true);
    expect(isMockable('POST', `/unified-rules${scope}`)).toBe(true);
    expect(isMockable('POST', '/unified-rules')).toBe(false);
    expect(isMockable('POST', `/unified-rules/test${scope}`)).toBe(true);
    expect(isMockable('GET', `/unified-rules/export${scope}`)).toBe(true);
  });

  it('provides paginated demo fixtures and global content groups', () => {
    const list = dispatch({
      method: 'GET',
      path: '/unified-rules?rule_page=content_rules&page=1&page_size=10',
    });
    expect(list.status).toBe(200);
    expect(list.data).toMatchObject({ total: 30, page: 1, page_size: 10 });
    expect((list.data as { items: unknown[] }).items).toHaveLength(10);

    const groups = dispatch({
      method: 'GET',
      path: '/unified-rules?page=groups&group_type=content&include=member_count%2Creference_count',
    });
    expect((groups.data as { items: Array<{ metadata?: string }> }).items).toHaveLength(3);
    expect((groups.data as { items: Array<{ metadata?: string }> }).items[0].metadata).toContain('content');
  });

  it('keeps expired rules out of enabled and disabled status filters', () => {
    const enabled = dispatch({ method: 'GET', path: '/unified-rules?rule_page=content_rules&status=enabled&page=1&page_size=100' });
    const disabled = dispatch({ method: 'GET', path: '/unified-rules?rule_page=content_rules&status=disabled&page=1&page_size=100' });
    const enabledItems = (enabled.data as { items: Array<{ name: string }> }).items;
    const disabledItems = (disabled.data as { items: Array<{ name: string }> }).items;

    expect(enabledItems.some((rule) => rule.name === '政治敏感词')).toBe(false);
    expect(disabledItems.some((rule) => rule.name === '政治敏感词')).toBe(false);
    expect(disabledItems.some((rule) => rule.name === '内部培训广告')).toBe(true);
  });

  it('supports create, update, test, copy, status, and delete against one stateful store', () => {
    const create = dispatch({
      method: 'POST',
      path: `/unified-rules${scope}`,
      body: {
        name: 'Mock CRUD rule',
        priority: 321,
        condition_tree: {
          type: 'AND',
          children: [
            { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
            { type: 'condition', field: 'subject', operator: 'contain', value: 'secret' },
          ],
        },
        action: 'quarantine',
        metadata: {
          feature: 'content_rules',
          match_type: 'keyword',
          match_content: 'secret',
          scopes: ['subject'],
          directions: { receive: { enabled: true, action: 'quarantine' } },
        },
        is_active: true,
      },
    });
    expect(create.status).toBe(201);
    const id = (create.data as { id: number }).id;

    const test = dispatch({
      method: 'POST',
      path: `/unified-rules/test${scope}`,
      body: {
        condition_tree: JSON.parse((create.data as { condition_tree: string }).condition_tree),
        test_attributes: { is_outbound: 'false', subject: 'top secret' },
      },
    });
    expect(test.data).toMatchObject({ matched: true });

    const update = dispatch({
      method: 'PUT',
      path: `/unified-rules/${id}${scope}`,
      body: { name: 'Updated mock rule' },
    });
    expect(update.data).toMatchObject({ id, name: 'Updated mock rule' });

    const status = dispatch({
      method: 'PUT',
      path: `/unified-rules/${id}/status${scope}`,
      body: { is_active: false },
    });
    expect(status.data).toMatchObject({ id, is_active: false });

    const copy = dispatch({ method: 'POST', path: `/unified-rules/${id}/copy${scope}` });
    expect(copy.status).toBe(201);
    expect((copy.data as { id: number }).id).not.toBe(id);

    expect(dispatch({ method: 'DELETE', path: `/unified-rules/${id}${scope}` }).status).toBe(200);
  });
});
