import { describe, it, expect } from 'vitest';
import { unifiedToRow, rowToUnifiedPayload, sortRuleRows, type OutboundRuleRow } from './rule-mapping';
import type { Rule, RuleNode } from '@/types/unified-rules';

// 出站路由步骤三路由规则（Task 13：接通真实后端）——unified route 规则 ⇄ OutboundRuleRow
// 映射单测。行为契约见 .superpowers/sdd/2026-07-29-mail-routing-backend-plan/task-13-brief.md。

function baseRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 5001,
    name: '默认外发',
    rule_class: 'route',
    stage: 'data',
    priority: 900,
    condition_tree: JSON.stringify({ type: 'AND', children: [] }),
    is_active: true,
    created_at: '2026-06-18 09:00:00',
    updated_at: '2026-06-18 09:00:00',
    ...overrides,
  };
}

describe('unifiedToRow', () => {
  it('metadata.tls_level 存在 → 换算成 camelCase TlsLevel', () => {
    const rule = baseRule({ metadata: JSON.stringify({ channel: 'smtp', tls_level: 'force_verify' }) });
    expect(unifiedToRow(rule).tlsLevel).toBe('forceVerify');
  });

  it('metadata.tls_level 缺失/空 → 兜底 prefer（doc/mail-routing.md §3.4）', () => {
    expect(unifiedToRow(baseRule({ metadata: JSON.stringify({ channel: 'smtp' }) })).tlsLevel).toBe('prefer');
    expect(unifiedToRow(baseRule({ metadata: undefined })).tlsLevel).toBe('prefer');
  });

  it('tls_success_rate 顶层字段直读（null 或数字）', () => {
    expect(unifiedToRow(baseRule({ tls_success_rate: 87 })).tlsSuccessRate).toBe(87);
    expect(unifiedToRow(baseRule({ tls_success_rate: null })).tlsSuccessRate).toBeNull();
    expect(unifiedToRow(baseRule({})).tlsSuccessRate).toBeNull();
  });

  it('metadata.channel="proxysvr" → channelId=`psg:<groupId>`', () => {
    const rule = baseRule({ metadata: JSON.stringify({ channel: 'proxysvr', proxysvr_group_id: 38 }) });
    expect(unifiedToRow(rule).channelId).toBe('psg:38');
  });

  it('metadata.channel="smtp"（或缺失） → channelId="default"，targetHost/targetPort 取 next_hop_*', () => {
    const rule = baseRule({ metadata: JSON.stringify({ channel: 'smtp', next_hop_host: 'mail.example.cn', next_hop_port: 465 }) });
    const row = unifiedToRow(rule);
    expect(row.channelId).toBe('default');
    expect(row.targetHost).toBe('mail.example.cn');
    expect(row.targetPort).toBe(465);
  });

  it('metadata 完全缺失 → 安全兜底（channelId=default，tlsLevel=prefer，targetPort=25，conditionTree 为空 AND）', () => {
    const row = unifiedToRow(baseRule({ metadata: undefined, condition_tree: undefined as unknown as string }));
    expect(row.channelId).toBe('default');
    expect(row.tlsLevel).toBe('prefer');
    expect(row.targetHost).toBe('');
    expect(row.targetPort).toBe(25);
    expect(row.conditionTree).toEqual({ type: 'AND', children: [] });
  });

  it('conditionTree 整树透传（GT-12321：is_outbound 等未知条件不被拆解/丢弃）', () => {
    const tree: RuleNode = {
      type: 'AND',
      children: [
        { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
        { type: 'condition', field: 'recipient_domain', operator: 'eq', value: 'osgateway.local' },
      ],
    };
    const row = unifiedToRow(baseRule({ condition_tree: JSON.stringify(tree) }));
    expect(row.conditionTree).toEqual(tree);
  });

  // 浏览器实测发现（真实后端 GET /unified-rules 列表响应 vs POST 创建响应对
  // condition_tree/metadata 的序列化不一致）：POST 创建响应体里两者是转义 JSON
  // 字符串，但 GET 列表响应体里同一条规则的两个字段已经是解析后的对象。
  it('metadata/condition_tree 为已解析对象（非字符串）时按对象直接读取，不整体读空', () => {
    const rule = {
      ...baseRule(),
      condition_tree: { type: 'AND', children: [{ type: 'condition', field: 'senderdomain', operator: 'eq', value: 'x.cn' }] },
      metadata: { channel: 'smtp', next_hop_host: 'smtp.example.cn', next_hop_port: 465 },
    } as unknown as Rule;
    const row = unifiedToRow(rule);
    expect(row.targetHost).toBe('smtp.example.cn');
    expect(row.targetPort).toBe(465);
    expect(row.conditionTree).toEqual({ type: 'AND', children: [{ type: 'condition', field: 'senderdomain', operator: 'eq', value: 'x.cn' }] });
  });

  it('is_active → status', () => {
    expect(unifiedToRow(baseRule({ is_active: true })).status).toBe('enabled');
    expect(unifiedToRow(baseRule({ is_active: false })).status).toBe('disabled');
  });

  it('name/priority/id/updated_at 原样透传', () => {
    const row = unifiedToRow(baseRule({ id: 5002, name: '金融合作方', priority: 980, updated_at: '2026-06-20 10:00:00' }));
    expect(row).toMatchObject({ id: 5002, ruleName: '金融合作方', priority: 980, updatedAt: '2026-06-20 10:00:00' });
  });
});

describe('rowToUnifiedPayload', () => {
  const tree: RuleNode = { type: 'AND', children: [{ type: 'condition', field: 'senderdomain', operator: 'eq', value: 'example.cn' }] };
  const row: OutboundRuleRow = {
    id: 5001,
    ruleName: '默认外发',
    priority: 900,
    status: 'enabled',
    channelId: 'default',
    tlsLevel: 'prefer',
    tlsSuccessRate: 98,
    conditionTree: tree,
    targetHost: '',
    targetPort: 25,
    updatedAt: '2026-06-18 09:00:00',
  };

  it('conditionTree 整树透传到 condition_tree（不做任何拆解/改写）', () => {
    expect(rowToUnifiedPayload(row).condition_tree).toEqual(tree);
  });

  it('channelId="default" → metadata.channel="smtp"', () => {
    expect(rowToUnifiedPayload(row).metadata.channel).toBe('smtp');
  });

  it('channelId=`psg:38` → metadata.channel="proxysvr"，proxysvr_group_id=38', () => {
    const payload = rowToUnifiedPayload({ ...row, channelId: 'psg:38' });
    expect(payload.metadata.channel).toBe('proxysvr');
    expect(payload.metadata.proxysvr_group_id).toBe(38);
  });

  it('status → is_active', () => {
    expect(rowToUnifiedPayload({ ...row, status: 'enabled' }).is_active).toBe(true);
    expect(rowToUnifiedPayload({ ...row, status: 'disabled' }).is_active).toBe(false);
  });

  it('tlsLevel 换算成后端 snake_case 写入 metadata.tls_level', () => {
    expect(rowToUnifiedPayload({ ...row, tlsLevel: 'forceVerify' }).metadata.tls_level).toBe('force_verify');
    expect(rowToUnifiedPayload({ ...row, tlsLevel: 'plain' }).metadata.tls_level).toBe('plain');
  });

  it('page/rule_class/stage 恒为出站路由步骤三约定', () => {
    const payload = rowToUnifiedPayload(row);
    expect(payload.page).toBe('mail_routing_outbound');
    expect(payload.rule_class).toBe('route');
    expect(payload.stage).toBe('data');
  });

  it('往返（unifiedToRow ∘ rowToUnifiedPayload）保持 conditionTree/channelId/tlsLevel 不变（default/psg 两种形状）', () => {
    for (const channelId of ['default', 'psg:38']) {
      const r = { ...row, channelId, tlsLevel: 'force' as const };
      const payload = rowToUnifiedPayload(r);
      const rule = baseRule({ condition_tree: JSON.stringify(payload.condition_tree), metadata: JSON.stringify(payload.metadata) });
      expect(unifiedToRow(rule).channelId).toBe(channelId);
      expect(unifiedToRow(rule).conditionTree).toEqual(tree);
      expect(unifiedToRow(rule).tlsLevel).toBe('force');
    }
  });
});

describe('sortRuleRows', () => {
  function row(id: number, priority: number): OutboundRuleRow {
    return {
      id,
      ruleName: `r${id}`,
      priority,
      status: 'enabled',
      channelId: 'default',
      tlsLevel: 'prefer',
      tlsSuccessRate: null,
      conditionTree: { type: 'AND', children: [] },
      targetHost: '',
      targetPort: 25,
      updatedAt: '',
    };
  }

  it('按优先级降序（DEV-1，数值越大越优先）', () => {
    const rows = [row(5001, 900), row(5002, 980)];
    expect(sortRuleRows(rows).map((r) => r.id)).toEqual([5002, 5001]);
  });

  it('优先级相同按 id 兜底稳定排序', () => {
    const rows = [row(5003, 900), row(5001, 900), row(5002, 900)];
    expect(sortRuleRows(rows).map((r) => r.id)).toEqual([5001, 5002, 5003]);
  });
});
