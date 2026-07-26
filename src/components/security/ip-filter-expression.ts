// GT-11464：IP 黑白名单 expression（表达式）类型的前端纯函数。
// 与后端 internal/models/ip_filter.go 的解析/校验语义同构：
//   - 分隔符 ';' 与 ',' 等价、可混用，空项忽略；
//   - 每项 = [!]<单IP | CIDR | start-end 区间>，'!' 前缀表示排除；
//   - 项数 ≤100、重复项拒绝；纯排除且无组引用拒绝（安全边界）；
//   - IPv4 区间做数值比较（start<=end）；IPv6 只做格式与同族校验，
//     顺序交给后端兜底（前端不引入 BigInt 比较的复杂度）。
// 抽成独立模块以便 vitest 直接函数级测试（不用渲染整个页面组件）。

import type {
  HeaderKV,
  IPFilterAction,
  IPFilterIPConfigType,
  IPFilterListType,
  IPFilterRulePayload,
} from '@/types/ip-filter';

// 与后端 maxIPExpressionItems / maxIPFilterGroups 保持一致。
export const MAX_EXPRESSION_ITEMS = 100;
export const MAX_IP_GROUPS = 20;

// 表达式校验可能产生的所有 i18n 错误码（ipFilter 命名空间下渲染）。
// ip-filter-validation-i18n.test.ts 用它保证四语翻译齐全。
export const IP_EXPRESSION_ERROR_CODES = [
  'expressionRequired',
  'expressionOnlyExclusions',
  'expressionItemInvalid',
  'expressionRangeInvalid',
  'expressionDuplicateItem',
  'expressionTooManyItems',
] as const;

export type IPExpressionErrorCode = (typeof IP_EXPRESSION_ERROR_CODES)[number];

export interface IPExprItem {
  negated: boolean;
  kind: 'ip' | 'cidr' | 'between';
  value: string; // 规范化文本（between 为 "start-end"，不含 ! 前缀）
}

export type IPExprParseResult =
  | { ok: true; items: IPExprItem[] }
  | { ok: false; error: IPExpressionErrorCode };

// ─── 基础 IP 校验（供本模块与 IPFilterPage 的 single/range 分支共用） ─────────

export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function isValidIPv6(ip: string): boolean {
  if (!ip.includes(':')) return false;
  try {
    return new URL(`http://[${ip}]/`).hostname.length > 0;
  } catch {
    return false;
  }
}

export function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

/** IPv4 → 32 位数值（用于区间比较/简化命中）。非法返回 null。 */
function ipv4ToNumber(ip: string): number | null {
  if (!isValidIPv4(ip)) return null;
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

// ─── 表达式解析 ───────────────────────────────────────────────────────────────

/** 解析单个表达式项（已 trim、已去 ! 前缀之外的形态判断）。 */
function parseItem(raw: string): { item?: IPExprItem; error?: IPExpressionErrorCode } {
  let s = raw.trim();
  let negated = false;
  if (s.startsWith('!')) {
    negated = true;
    s = s.slice(1).trim();
  }
  if (!s) return { error: 'expressionItemInvalid' };

  if (s.includes('/')) {
    // CIDR
    const [ipStr, prefixStr, extra] = s.split('/');
    if (!ipStr || !prefixStr || extra !== undefined || !/^\d+$/.test(prefixStr) || !isValidIP(ipStr)) {
      return { error: 'expressionItemInvalid' };
    }
    const maxPrefix = isValidIPv6(ipStr) ? 128 : 32;
    if (Number(prefixStr) > maxPrefix) return { error: 'expressionItemInvalid' };
    return { item: { negated, kind: 'cidr', value: s } };
  }

  // 区间：IPv6 地址本身不含 '-'，按第一个 '-' 切分对 v4/v6 都安全（同后端）。
  const dash = s.indexOf('-');
  if (dash >= 0) {
    const start = s.slice(0, dash).trim();
    const end = s.slice(dash + 1).trim();
    if (!isValidIP(start) || !isValidIP(end)) return { error: 'expressionRangeInvalid' };
    const startIsV4 = isValidIPv4(start);
    if (startIsV4 !== isValidIPv4(end)) return { error: 'expressionRangeInvalid' };
    if (startIsV4) {
      const a = ipv4ToNumber(start);
      const b = ipv4ToNumber(end);
      if (a === null || b === null || a > b) return { error: 'expressionRangeInvalid' };
    }
    // IPv6 区间顺序不在前端比较，交后端兜底。
    return { item: { negated, kind: 'between', value: `${start}-${end}` } };
  }

  if (!isValidIP(s)) return { error: 'expressionItemInvalid' };
  return { item: { negated, kind: 'ip', value: s } };
}

/** 解析整个表达式。空项（连续分隔符）忽略；重复项与超限拒绝。 */
export function parseIPExpression(expr: string): IPExprParseResult {
  const fields = expr.split(/[;,]/);
  const items: IPExprItem[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f.trim()) continue;
    const { item, error } = parseItem(f);
    if (error || !item) return { ok: false, error: error ?? 'expressionItemInvalid' };
    // 与后端 canonical() 同构：'!' 前缀 + 规范化文本；IPv6 大小写归一。
    const key = (item.negated ? '!' : '') + item.value.toLowerCase();
    if (seen.has(key)) return { ok: false, error: 'expressionDuplicateItem' };
    seen.add(key);
    items.push(item);
  }
  if (items.length > MAX_EXPRESSION_ITEMS) return { ok: false, error: 'expressionTooManyItems' };
  return { ok: true, items };
}

/**
 * expression 类型的整体校验（zod superRefine 入口）。
 * 返回第一个错误码；null 表示通过。
 * 安全边界（与后端一致）：正向目标（内联正项或组）至少一个 ——
 * 仅排除项且无组的规则会意外匹配全网，必须前端就拦截。
 */
export function validateIPExpressionConfig(ipValue: string, groupCount: number): IPExpressionErrorCode | null {
  const parsed = parseIPExpression(ipValue);
  if (!parsed.ok) return parsed.error;
  if (parsed.items.length === 0) {
    return groupCount > 0 ? null : 'expressionRequired';
  }
  const hasPositive = parsed.items.some((it) => !it.negated);
  if (!hasPositive && groupCount === 0) return 'expressionOnlyExclusions';
  return null;
}

// ─── payload 构造 / 编辑回填 ─────────────────────────────────────────────────

export function toRFC3339(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export interface IPFilterRuleFormValues {
  name: string;
  description?: string;
  list_type: IPFilterListType;
  ip_config_type: IPFilterIPConfigType;
  ip_value?: string;
  ip_groups?: number[];
  priority: number;
  is_active: boolean;
  valid_until?: string;
}

/**
 * 表单值 → 提交 payload。
 * expression 携带 ip_groups（数值规则 ID 数组）与 trim 后的表达式原文；
 * single/range 不携带 ip_groups（后端对非 expression 带组会 400）。
 */
export function buildIPFilterRulePayload(
  data: IPFilterRuleFormValues,
  gateway: { action: IPFilterAction; add_headers?: HeaderKV[] },
): IPFilterRulePayload {
  const isExpression = data.ip_config_type === 'expression';
  const payload: IPFilterRulePayload = {
    name: data.name,
    description: data.description,
    list_type: data.list_type,
    ip_config_type: data.ip_config_type,
    ip_value: (data.ip_value ?? '').trim(),
    action: gateway.action,
    add_headers: gateway.add_headers,
    priority: data.priority,
    is_active: data.is_active,
    valid_until: toRFC3339(data.valid_until),
  };
  if (isExpression) payload.ip_groups = data.ip_groups ?? [];
  return payload;
}

/** 列表行 → 表单回填的 IP 配置三字段（编辑弹窗用）。 */
export function ipConfigFieldsFromView(view: {
  ip_config_type: IPFilterIPConfigType;
  ip_value: string;
  ip_groups?: number[];
}): { ip_config_type: IPFilterIPConfigType; ip_value: string; ip_groups: number[] } {
  return {
    ip_config_type: view.ip_config_type,
    ip_value: view.ip_value ?? '',
    ip_groups: view.ip_groups ?? [],
  };
}

// ─── 模拟测试的简化命中（仅评估内联项，组成员前端不可知） ────────────────────

/** 单项简化命中：单 IP 全等；CIDR 前两段前缀比较（对齐 demo）；区间 IPv4 数值比较。 */
function itemMatchesSimple(testIp: string, item: IPExprItem): boolean {
  if (item.kind === 'ip') return testIp === item.value;
  if (item.kind === 'cidr') {
    const [network] = item.value.split('/');
    const n = network.split('.');
    const t = testIp.split('.');
    return n[0] === t[0] && n[1] === t[1];
  }
  // between：仅 IPv4 数值比较，IPv6 简化为不命中（后端才是权威判定）。
  const [start, end] = item.value.split('-');
  const a = ipv4ToNumber(start);
  const b = ipv4ToNumber(end);
  const x = ipv4ToNumber(testIp);
  if (a === null || b === null || x === null) return false;
  return a <= x && x <= b;
}

/**
 * 表达式简化命中（模拟测试展示用，非权威）：
 * 命中 = 任一正向内联项匹配 且 无排除项匹配。组引用不参与（成员在前端不可知）。
 */
export function ipMatchesExpressionSimple(testIp: string, expr: string): boolean {
  const parsed = parseIPExpression(expr);
  if (!parsed.ok) return false;
  const positiveHit = parsed.items.some((it) => !it.negated && itemMatchesSimple(testIp, it));
  const excluded = parsed.items.some((it) => it.negated && itemMatchesSimple(testIp, it));
  return positiveHit && !excluded;
}
