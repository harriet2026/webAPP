// 出站路由步骤三：路由规则（Task 13 接通真实后端）—— unified route 规则 ⇄ OutboundRuleRow 映射。
// 对齐 doc/mail-routing.md §3.4/§5、internal/models/unified_rules.go RouteDecision。
//
// 规则 CRUD 走 unified-rules（真实后端权威）；TLS 等级现在读写 metadata.tls_level（真实字段，
// 取代旧 mock-only metadata.mr_ext.tlsLevel）；成功率读列表响应顶层的 tls_success_rate
// （page=mail_routing_outbound 专属聚合字段，取代旧 mr_ext.tlsSuccessRate）；通道现在恒指向真实
// proxysvr_groups（'default' 直连 next-hop，或 `psg:<groupId>` 引用具体通道）——不再有 mock-only
// 数字通道 id 这个第三种形状。
//
// GT-12321 约束：conditionTree 是规则完整条件树的容器，本文件的 unifiedToRow/rowToUnifiedPayload
// 只做整树透传（JSON.parse/JSON.stringify），不拆解、不改写、不注入/剥离 is_outbound —— 五个
// discrete 字段（来源IP/发信域名/发信人/收信域名/收信人）与 is_outbound 等"未知"条件的合并/拆分
// 逻辑在 rule-step.tsx（表单层）完成，这里保持树的往返对称。

import type { Rule, RuleNode } from '@/types/unified-rules';
import { isIPv4, type EnableStatus, type TlsLevel } from '../mr-types';

/** 出站规则的条件树，就是 unified-rules 的 RuleNode——起别名只为在本模块内文档化用途。 */
export type ConditionTree = RuleNode;

/** UI 侧 camelCase TlsLevel ⇄ 后端 snake_case tls_level 双向换算。空/未知值归一为 'prefer'
 * （doc/mail-routing.md §3.4："空值等价于 prefer"）。 */
const TLS_LEVEL_TO_WIRE: Record<TlsLevel, string> = {
  plain: 'plain',
  prefer: 'prefer',
  force: 'force',
  forceVerify: 'force_verify',
};
const WIRE_TO_TLS_LEVEL: Record<string, TlsLevel> = {
  plain: 'plain',
  prefer: 'prefer',
  force: 'force',
  force_verify: 'forceVerify',
};

export interface OutboundRuleRow {
  id: number;
  ruleName: string;
  priority: number;
  status: EnableStatus;
  /** 'default'（直连 targetHost:targetPort）| `psg:${proxysvrGroupId}`（真实 proxysvr 通道）。 */
  channelId: string;
  tlsLevel: TlsLevel;
  /** 近 24h TLS 成功率（%），null=近窗口无投递统计。 */
  tlsSuccessRate: number | null;
  conditionTree: ConditionTree;
  targetHost: string;
  targetPort: number;
  updatedAt: string;
}

const EMPTY_TREE: ConditionTree = { type: 'AND', children: [] };

// 真实后端对 condition_tree/metadata 的序列化不一致（浏览器实测发现）：POST 创建响应体里
// 两者是转义 JSON 字符串，但 GET 列表响应体里同一条规则的两个字段已经是解析后的对象——
// 这里做同款防御：非字符串输入（对象/已解析值）直接当作已解析结果返回，只有真正拿到字符串
// 时才走 JSON.parse。
function parseJson<T>(raw: string | Record<string, unknown> | undefined, fallback: T): T {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

interface RouteMetadata {
  channel?: 'smtp' | 'proxysvr';
  next_hop_type?: 'ip' | 'domain';
  next_hop_host?: string;
  next_hop_port?: number;
  proxysvr_group_id?: number;
  target_host?: string;
  target_port?: number;
  tls_level?: string;
  // 索引签名：payload.metadata 要传给 src/lib/api/unified-rules.ts 的
  // CreateRuleRequest/UpdateRuleRequest（metadata: Record<string, unknown>），
  // 这里的具体字段名只是本模块已知的子集，不代表 metadata 只能有这些键。
  [key: string]: unknown;
}

// unified route 规则 → 出站规则行。channelId 判别：metadata.channel="proxysvr" → `psg:<id>`；
// 否则（含 "smtp"/缺失）→ 'default'。
export function unifiedToRow(r: Rule): OutboundRuleRow {
  const meta = parseJson<RouteMetadata>(r.metadata, {});
  const channelId = meta.channel === 'proxysvr' ? `psg:${meta.proxysvr_group_id ?? ''}` : 'default';
  const targetHost = meta.next_hop_host ?? meta.target_host ?? '';
  const targetPort = meta.next_hop_port ?? meta.target_port ?? 25;
  const tlsLevel = (meta.tls_level && WIRE_TO_TLS_LEVEL[meta.tls_level]) || 'prefer';

  return {
    id: r.id,
    ruleName: r.name,
    priority: r.priority,
    status: r.is_active ? 'enabled' : 'disabled',
    channelId,
    tlsLevel,
    tlsSuccessRate: typeof r.tls_success_rate === 'number' ? r.tls_success_rate : null,
    conditionTree: parseJson<ConditionTree>(r.condition_tree, EMPTY_TREE),
    targetHost,
    targetPort,
    updatedAt: r.updated_at,
  };
}

export interface OutboundRulePayload {
  name: string;
  priority: number;
  is_active: boolean;
  rule_class: 'route';
  stage: 'data';
  page: 'mail_routing_outbound';
  condition_tree: ConditionTree;
  metadata: RouteMetadata;
}

// 出站规则行 → unified-rules 保存 payload。channelId 的两种形状分别换算回 legacy
// channel / next_hop_* / proxysvr_group_id 字段；tls_level 恒写入（真实字段，不再是
// mock-only 展示位）。
//
// channel="smtp" 分支必须带 next_hop_type（'ip'|'domain'，由 targetHost 是否为合法 IPv4 判
// 别）——真实后端 internal/api/unified_rules.go::validateRouteRuleMetadata 对 channel=smtp
// 强制要求 next_hop_type/next_hop_host/next_hop_port 三者齐全，缺 next_hop_type 会 400
// "route rule metadata must have next_hop_type of 'ip' or 'domain'"。channel=proxysvr 分支
// 不受此约束（该分支校验只要求 proxysvr_group_id）。
export function rowToUnifiedPayload(row: OutboundRuleRow, base?: Partial<OutboundRulePayload>): OutboundRulePayload {
  const isPsg = row.channelId.startsWith('psg:');
  const legacy: RouteMetadata = isPsg
    ? { channel: 'proxysvr', proxysvr_group_id: Number(row.channelId.slice(4)) || undefined }
    : {
        channel: 'smtp',
        next_hop_type: isIPv4(row.targetHost) ? 'ip' : 'domain',
        next_hop_host: row.targetHost,
        next_hop_port: row.targetPort,
      };

  return {
    name: row.ruleName,
    priority: row.priority,
    is_active: row.status === 'enabled',
    rule_class: 'route',
    stage: 'data',
    page: 'mail_routing_outbound',
    condition_tree: row.conditionTree,
    metadata: {
      ...legacy,
      target_host: row.targetHost,
      target_port: row.targetPort,
      tls_level: TLS_LEVEL_TO_WIRE[row.tlsLevel] ?? 'prefer',
    },
    ...base,
  };
}

/** 列表排序：优先级降序（DEV-1，数值越大越优先），按 id 兜底稳定排序。 */
export function sortRuleRows(rows: OutboundRuleRow[]): OutboundRuleRow[] {
  return [...rows].sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.id - b.id));
}
