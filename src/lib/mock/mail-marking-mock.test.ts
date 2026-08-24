import { describe, expect, it } from 'vitest';
import { dispatch, isMockable } from './dispatcher';
import { mockMailMarkingGroupsList, mockMailMarkingRulesList } from './fixtures';

describe('mail_marking mock', () => {
  it('provides the six demo rules', () => {
    const result = mockMailMarkingRulesList();
    expect(result.items).toHaveLength(6);
    expect(result.items.every((rule) => rule.action === 'proceed')).toBe(true);
    expect(result.items.map((rule) => rule.name)).toEqual([
      '高管外站警示', '财务专用提示', '默认外站提示', '研发静默标记',
      '销售部免责声明', '法务部专用声明',
    ]);
  });

  it('provides direction-specific department and group scopes', () => {
    const result = mockMailMarkingGroupsList();
    expect(result.items).toHaveLength(20);
    const metadata = result.items.map((item) => JSON.parse(item.metadata ?? '{}'));
    expect(metadata.filter((item) => item.group_type === 'recipient')).toHaveLength(10);
    expect(metadata.filter((item) => item.group_type === 'sender')).toHaveLength(10);
  });

  it('covers list, group, CRUD and test endpoints', () => {
    expect(isMockable('GET', '/unified-rules?rule_page=mail_marking&rule_class=action')).toBe(true);
    expect(isMockable('GET', '/unified-rules?rule_page=groups')).toBe(true);
    expect(isMockable('POST', '/unified-rules?scope=mail_marking')).toBe(true);
    expect(isMockable('PUT', '/unified-rules/5101?scope=mail_marking')).toBe(true);
    expect(isMockable('DELETE', '/unified-rules/5101?scope=mail_marking')).toBe(true);
    expect(isMockable('POST', '/unified-rules/test?scope=mail_marking')).toBe(true);
  });

  it('mutates mail-marking state for create/update/delete', () => {
    const create = dispatch({
      method: 'POST', path: '/unified-rules?scope=mail_marking',
      body: {
        name: '测试声明', priority: 99, is_active: true,
        condition_tree: { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'true' },
        metadata: { feature: 'mail_marking', direction: 'send', departments: [], groups: [], disclaimer: { content: 'x', positions: ['body_bottom'], format: 'auto' } },
      },
    });
    expect(create?.status).toBe(201);
    expect((create?.data as { action?: string }).action).toBe('proceed');
    const id = (create?.data as { id: number }).id;
    expect(dispatch({ method: 'PUT', path: `/unified-rules/${id}?scope=mail_marking`, body: { name: '已更新' } })?.status).toBe(200);
    expect(dispatch({ method: 'DELETE', path: `/unified-rules/${id}?scope=mail_marking` })?.status).toBe(200);
  });
});
