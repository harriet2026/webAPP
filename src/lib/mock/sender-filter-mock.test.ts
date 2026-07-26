import { describe, it, expect } from 'vitest';
import { dispatch, isMockable } from '@/lib/mock/dispatcher';
import { listSenderFilterGroups } from '@/lib/api/sender-filter';
import { GROUPS_LIST_QUERY } from '@/lib/api/groups';
import type { ApiRequestFn } from '@/lib/api/client';

describe('sender_filter mock', () => {
  const path = '/unified-rules?rule_page=sender_filter&rule_class=action&stage=rcpt&page_size=10000';
  it('被 mock 覆盖', () => {
    expect(isMockable('GET', path)).toBe(true);
  });
  it('返回 demo 5 条规则', () => {
    const res = dispatch({ method: 'GET', path });
    const items = (res.data as { items: unknown[] }).items;
    expect(items).toHaveLength(5);
  });
  it('首行 = 垃圾邮件发送者 / reject / spam@bad.com', () => {
    const res = dispatch({ method: 'GET', path });
    const first = (res.data as { items: Array<{ name: string; action: string; condition_tree: string }> }).items[0];
    expect(first.name).toBe('垃圾邮件发送者');
    expect(first.action).toBe('reject');
    expect(first.condition_tree).toContain('spam@bad.com');
  });
  // 群组 fixture 数据面照抄群组策略页 demo 的 staticGroups（html_spec
  // filter-rules-group-policy）：群组在真实产品中是唯一数据面，sender_filter
  // 下拉与群组管理共享同一份 mock 数据。
  it('群组查询通过 listSenderFilterGroups 解析出 研发部门(120)/合作伙伴域名(25)/可信IP(8)', async () => {
    const requestFn: ApiRequestFn = async <T,>(p: string) => {
      const res = dispatch({ method: 'GET', path: p });
      return res.data as T;
    };
    const groups = await listSenderFilterGroups(requestFn);
    expect(groups.senderGroups).toEqual([
      { name: '研发部门', memberCount: 120 },
      { name: '合作伙伴域名', memberCount: 25 },
    ]);
    expect(groups.ipGroups).toEqual([{ name: '可信IP', memberCount: 8 }]);
  });
});

describe('/unified-rules mock 只覆盖 sender_filter 与群组两种 query（回归：其余模块必须放行到真实后端）', () => {
  it('sender_filter 列表页 query 被 mock 覆盖', () => {
    expect(
      isMockable('GET', '/unified-rules?rule_page=sender_filter&rule_class=action&stage=rcpt&page_size=10000'),
    ).toBe(true);
  });

  it('群组下拉的真实 GROUPS_LIST_QUERY 被 mock 覆盖，返回 sender/ip+特征 8 个 + 收信人组 5 个 + 内容组 3 个（并入而非替换，不回归既有分支）', () => {
    const query = new URLSearchParams(GROUPS_LIST_QUERY).toString();
    const path = `/unified-rules?${query}`;
    expect(isMockable('GET', path)).toBe(true);
    const res = dispatch({ method: 'GET', path });
    const items = (res.data as { items: unknown[] }).items;
    expect(items).toHaveLength(16);
  });

  it('behavior_control 页的 query 被 mock 覆盖（渲染 demo 数据用于对齐）', () => {
    expect(isMockable('GET', '/unified-rules?rule_page=behavior_control')).toBe(true);
  });

  it('advanced_rules 页的 query 不被 mock 覆盖', () => {
    expect(isMockable('GET', '/unified-rules?rule_page=advanced_rules&rule_class=action')).toBe(false);
  });

  it('mail_marking 的 rule_page=groups 由独立作用域 fixture 覆盖', () => {
    expect(isMockable('GET', '/unified-rules?rule_page=groups')).toBe(true);
  });

  it('通用 getUnifiedRules 无 rule_page/page 的 query 不被 mock 覆盖', () => {
    expect(isMockable('GET', '/unified-rules?rule_class=action&stage=data')).toBe(false);
  });

  it('无 matchQuery 的既有路由不受影响：/bootstrap 仍可 mock', () => {
    expect(isMockable('GET', '/bootstrap')).toBe(true);
  });
});
