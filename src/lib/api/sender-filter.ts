import type { Rule, RuleNode } from '@/types/unified-rules';
import type {
  SenderFilterFormData,
  SenderFilterGroups,
  SenderFilterMetadata,
  SenderFilterSenderConfig,
  SenderFilterIPRange,
  SenderFilterRuleView,
} from '@/types/sender-filter';
import type { ApiRequestFn } from './client';
import { apiRequest } from './client';
import { GROUPS_LIST_QUERY, ruleToGroup } from './groups';

export const SENDER_FILTER_PAGE = 'sender_filter';

/**
 * Unified-rule payloads may reach the UI either as persisted JSON strings or
 * as objects already decoded by an API proxy. Keep the editor tolerant of
 * both representations so an existing rule can always be reconstructed.
 */
function parseRuleObject(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function buildSenderChild(sc: SenderFilterSenderConfig): RuleNode {
  if (sc.type === 'individual') {
    // *@domain.com → suffix 匹配 @domain.com，后端 suffix 操作符已原生支持
    if (sc.value.startsWith('*@')) {
      return { type: 'condition', field: 'sender', operator: 'suffix', value: sc.value.slice(1) };
    }
    return { type: 'condition', field: 'sender', operator: 'eq', value: sc.value };
  }
  if (sc.type === 'domain') {
    return { type: 'condition', field: 'senderdomain', operator: 'eq', value: sc.value };
  }
  return { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: `grp:${sc.value}` };
}

function buildIPChild(ip: SenderFilterIPRange): RuleNode | null {
  if (ip.type === 'all') return null;
  if (ip.type === 'single') return { type: 'condition', field: 'client_ip', operator: 'eq', value: ip.value! };
  if (ip.type === 'range') return { type: 'condition', field: 'client_ip', operator: 'cidr', value: ip.value! };
  return { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: `grp:${ip.value!}` };
}

export function buildConditionTree(
  data: Pick<SenderFilterFormData, 'sender_config' | 'ip_range'>,
): RuleNode {
  const sender = buildSenderChild(data.sender_config);
  const ip = buildIPChild(data.ip_range);
  if (!ip) return sender;
  return { type: 'AND', children: [sender, ip] };
}

function parseSenderChild(n: RuleNode): SenderFilterSenderConfig | null {
  if (!n || n.type !== 'condition') return null;
  if (n.field === 'sender' && n.operator === 'eq')
    return { type: 'individual', value: n.value! };
  // suffix + @domain → 回显为 *@domain（buildSenderChild 的通配符形式）
  if (n.field === 'sender' && n.operator === 'suffix' && n.value!.startsWith('@'))
    return { type: 'individual', value: '*' + n.value! };
  if (n.field === 'senderdomain' && n.operator === 'eq')
    return { type: 'domain', value: n.value! };
  if (n.field === 'rcpttags' && n.operator === 'hasTag' && n.value!.startsWith('grp:'))
    return { type: 'group', value: n.value!.slice(4) };
  return null;
}

function parseIPChild(n: RuleNode): SenderFilterIPRange | null {
  if (!n || n.type !== 'condition') return null;
  if (n.field === 'client_ip' && n.operator === 'eq')
    return { type: 'single', value: n.value };
  if (n.field === 'client_ip' && n.operator === 'cidr')
    return { type: 'range', value: n.value };
  if (n.field === 'rcpttags' && n.operator === 'hasTag' && n.value!.startsWith('grp:'))
    return { type: 'ipGroup', value: n.value!.slice(4) };
  return null;
}

export function parseSenderFilterRule(tree: RuleNode | null): {
  sender_config: SenderFilterSenderConfig;
  ip_range: SenderFilterIPRange;
} | null {
  if (!tree) return null;
  if (tree.type === 'condition') {
    const sender = parseSenderChild(tree);
    if (!sender) return null;
    return { sender_config: sender, ip_range: { type: 'all' } };
  }
  if (tree.type !== 'AND' || !tree.children || tree.children.length === 0) return null;
  // Walk the AND's children and classify each as sender / ip / unknown. This
  // is order-independent (the backend may rewrite the tree) and tolerates an
  // AND wrapper with a single sender-only child.
  //
  // Note: an rcpttags+hasTag child is ambiguous — it can denote either a
  // sender group or an IP group. We resolve this by always classifying it as
  // the sender child first (a sender_filter rule always carries a sender
  // config); only children that do NOT match the sender grammar are then
  // considered as IP children. This preserves the spec's invariant that every
  // rule has exactly one sender condition.
  let sender: SenderFilterSenderConfig | null = null;
  let ip: SenderFilterIPRange | null = null;
  for (const child of tree.children) {
    if (!sender) {
      const s = parseSenderChild(child);
      if (s) {
        sender = s;
        continue;
      }
    }
    if (!ip) {
      ip = parseIPChild(child);
    }
  }
  if (!sender) return null;
  return { sender_config: sender, ip_range: ip ?? { type: 'all' } };
}

export function resolveSenderFilterRule(rule: Rule): SenderFilterMetadata | null {
  let metadata: SenderFilterMetadata | null = null;
  const parsedMetadata = parseRuleObject(rule.metadata);
  if (parsedMetadata?.feature === 'sender_filter') {
    metadata = parsedMetadata as unknown as SenderFilterMetadata;
  }

  const treeShape = parseSenderFilterRule(
    parseRuleObject(rule.condition_tree) as RuleNode | null,
  );

  // `metadata.sender_config` / `metadata.ip_range` must be checked, not just
  // `metadata`. A sender_filter rule can carry metadata that merely says
  // {"feature":"sender_filter"} — POST /unified-rules accepts it, and rule
  // import or any non-UI client can produce it. Reading .type off the missing
  // object threw "Cannot read properties of undefined (reading 'type')" from
  // inside render (SenderFilterPage maps rules through here), so the error
  // boundary replaced the ENTIRE page with 操作失败 — one such row bricked the
  // whole sender-filter view. Treat incomplete metadata as unusable and fall
  // through to the condition-tree derivation below, which reconstructs the same
  // shape from the rule itself.
  if (metadata && treeShape && metadata.sender_config && metadata.ip_range) {
    const matchesSender =
      metadata.sender_config.type === treeShape.sender_config.type &&
      metadata.sender_config.value === treeShape.sender_config.value;
    const matchesIP =
      metadata.ip_range.type === treeShape.ip_range.type &&
      (metadata.ip_range.value ?? '') === (treeShape.ip_range.value ?? '');
    if (matchesSender && matchesIP) {
      if (metadata.list_type === 'whitelist' && !metadata.whitelist_mode) {
        return {
          ...metadata,
          whitelist_mode: rule.tags?.includes('sys:nocontent')
            ? 'bypass_content'
            : 'direct_deliver',
        };
      }
      return metadata;
    }
  }
  if (treeShape) {
    return {
      feature: 'sender_filter',
      sender_config: treeShape.sender_config,
      ip_range: treeShape.ip_range,
      list_type: rule.action === 'accept' ? 'whitelist' : 'blacklist',
      whitelist_mode: rule.action === 'accept'
        ? (rule.tags?.includes('sys:nocontent') ? 'bypass_content' : 'direct_deliver')
        : undefined,
    };
  }
  return null;
}

export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.startsWith('*@')) s = s.slice(2);
  else if (s.startsWith('@')) s = s.slice(1);
  return s;
}

export async function listSenderFilterRules(
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ items: Rule[] }> {
  return requestFn('/unified-rules?rule_page=sender_filter&rule_class=action&stage=rcpt&page_size=10000');
}

export async function listSenderFilterGroups(
  requestFn: ApiRequestFn = apiRequest,
): Promise<SenderFilterGroups> {
  const qs = new URLSearchParams(GROUPS_LIST_QUERY).toString();
  const response = await requestFn<{ items: Rule[] }>(`/unified-rules?${qs}`);
  const groups = (response.items ?? []).map(ruleToGroup).filter((g): g is NonNullable<typeof g> => Boolean(g));
  return {
    senderGroups: groups.filter((g) => g.type === 'sender').map((g) => ({ name: g.name, memberCount: g.memberCount })),
    ipGroups: groups.filter((g) => g.type === 'ip').map((g) => ({ name: g.name, memberCount: g.memberCount })),
  };
}

export async function testSenderFilterRule(
  conditionTree: RuleNode,
  testAttributes: Record<string, string>,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ matched: boolean; evaluated_conditions: unknown[] }> {
  return requestFn('/unified-rules/test', {
    method: 'POST',
    body: {
      condition_tree: conditionTree,
      test_attributes: testAttributes,
    },
  });
}

import type { ListType } from '@/types/sender-filter';

/** 列表展示用规则 ID：BL/WL-<created_at YYYYMMDD>-<id 补零3位>。
 *  说明：NNN 取 rule.id（非 demo 的当日序号，统一规则系统无当日序号概念）。 */
export function formatListId(rule: Rule, listType: ListType): string {
  const prefix = listType === 'blacklist' ? 'BL' : 'WL';
  const d = new Date(rule.created_at);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${String(rule.id).padStart(3, '0')}`;
}

/** 状态筛选取值：全部 / 仅启用 / 仅禁用（GT-11721）。 */
export type SenderFilterStatusFilter = 'all' | 'enabled' | 'disabled';

function conditionTreeSearchText(conditionTree: unknown): string {
  if (typeof conditionTree === 'string') return conditionTree.toLowerCase();
  try {
    return JSON.stringify(conditionTree)?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

/**
 * 列表筛选纯函数：黑/白名单 Tab × 关键字搜索 × 启用状态（GT-11721）。
 * 搜索覆盖规则名、展示 ID、解析出的发信人/IP 值；复杂规则（无
 * sender-filter 投影）退化为搜索其原始条件树，保证高级编辑器规则的
 * 发信人/IP 值仍可被检索到。
 */
export function filterSenderFilterRules(
  items: SenderFilterRuleView[],
  opts: { listType?: string; search?: string; status?: SenderFilterStatusFilter },
): SenderFilterRuleView[] {
  let out = items;
  if (opts.listType) {
    out = out.filter((r) => r.list_type === opts.listType);
  }
  if (opts.status && opts.status !== 'all') {
    const wantActive = opts.status === 'enabled';
    out = out.filter((r) => r.rule.is_active === wantActive);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter(
      (r) =>
        r.rule.name.toLowerCase().includes(q) ||
        r.list_id_display.toLowerCase().includes(q) ||
        (r.resolved?.sender_config?.value?.toLowerCase().includes(q) ?? false) ||
        (r.resolved?.ip_range?.value?.toLowerCase().includes(q) ?? false) ||
        conditionTreeSearchText(r.rule.condition_tree).includes(q),
    );
  }
  return out;
}
