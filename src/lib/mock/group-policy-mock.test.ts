import { describe, it, expect } from 'vitest';
import { dispatch, isMockable } from '@/lib/mock/dispatcher';
import type { Rule } from '@/types/unified-rules';

// 群组策略 mock 覆盖契约（html_spec filter-rules-group-policy 对齐，
// design/implement/spec/2026-07-18-group-policy-html-spec-alignment.md §4.1）：
// - 策略/群组列表 GET 与策略写操作（mock id 段 9xxx）必须命中 mock；
// - POST 与其他模块的无 scope 写操作必须放行真实后端（防 dispatcher 误吞）。
describe('group-policy mock coverage', () => {
  it('列表与 9xxx 写操作命中 mock；POST 与非 mock id 放行', () => {
    const rows: [string, string, boolean][] = [
      ['GET', '/unified-rules?rule_class=tag&page=group_policy&include=member_count%2Creference_count', true],
      ['GET', '/unified-rules?rule_class=tag&page=groups&include=member_count%2Creference_count', true],
      ['PUT', '/unified-rules/9001', true],
      ['DELETE', '/unified-rules/9005', true],
      ['POST', '/unified-rules', false],
      ['PUT', '/unified-rules/123', false],
      // 注意：非 9xxx 的 DELETE 命中的是 dispatcher 尾部「既有」的泛化
      // DELETE /unified-rules/{id} 兜底路由（其它模块的历史 mock），不是本模块新增；
      // 这里钉住现状，防止误以为 9xxx 路由吞掉了别的模块。
      ['DELETE', '/unified-rules/123', true],
    ];
    for (const [m, p, want] of rows) {
      expect(isMockable(m, p), `${m} ${p}`).toBe(want);
    }
  });

  it('策略列表返回 demo 的 5 条演示规则（名称/优先级/启用逐值一致）', () => {
    const res = dispatch({ method: 'GET', path: '/unified-rules?rule_class=tag&page=group_policy' });
    const items = (res.data as { items: Rule[] }).items;
    expect(items.map((r) => [r.name, r.priority, r.is_active])).toEqual([
      ['高管邮箱快速通道', 0, true],
      ['可信IP通道', 1, true],
      ['研发部门外发', 2, false],
      ['IP群组1-附件检测禁用', 1, true],
      ['IP群组1-RBL隔离', 2, true],
    ]);
  });

  it('群组列表头部为 demo 的 5 普通组 + 3 特征组（成员数/引用数逐值一致），后接并入的收信人/内容组', () => {
    const res = dispatch({ method: 'GET', path: '/unified-rules?rule_class=tag&page=groups&include=member_count%2Creference_count' });
    const items = (res.data as { items: (Rule & { member_count?: number; reference_count?: number })[] }).items;
    // GROUPS_LIST_QUERY 是多个模块共用的组合列表（dispatcher 注释「并入而非
    // 替换」）：头部 8 条是本模块的普通+特征组，其后为处置设置的收信人组(5)
    // 与 admission 的内容组(3)，客户端各自按 ruleToGroup 的 type 再筛选。
    expect(items).toHaveLength(16);
    expect(items.slice(0, 8).map((r) => [r.name, r.member_count, r.reference_count])).toEqual([
      ['高管邮箱', 15, 3],
      ['研发部门', 120, 1],
      ['可信IP', 8, 2],
      ['敏感关键词', 45, 4],
      ['合作伙伴域名', 25, 2],
      ['钓鱼仿冒特征', 3, 2],
      ['恶意附件特征', 2, 0],
      ['批量营销特征', 2, 1],
    ]);
  });

  it('状态开关 PUT {is_active} 在 mock 会话内生效', () => {
    const toggled = dispatch({ method: 'PUT', path: '/unified-rules/9003', body: { is_active: true } });
    expect((toggled.data as Rule).is_active).toBe(true);
    // 还原，避免影响同进程内其它用例
    dispatch({ method: 'PUT', path: '/unified-rules/9003', body: { is_active: false } });
  });
});
