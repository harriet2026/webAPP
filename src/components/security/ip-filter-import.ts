// IP 黑白名单「批量导入」的解析与去重纯逻辑（GT-12137）。
//
// 与弹窗组件分离，便于单测覆盖。原型（design/origin/spec/IP黑白名单需求文档.md §批量导入）
// 要求：文本粘贴（每行一个 IP/IP段）+ 文件上传 + 导入前预览 +
// 重复 IP 自动去重（可选覆盖/跳过），单次上限 1000 条。
// 文件格式与「导出」一致：rule-settings/v1 JSON envelope（导出的 .json 可直接导回），
// 见 parseExportEnvelope。
//
// 复用现有校验：单 IP / CIDR 用 isValidIP + 前缀范围；区间用 parseItem 的同款判定。
// 不引入第二套 IP 语义，避免与规则表单校验漂移。

import { isValidIP, isValidIPv6 } from './ip-filter-expression';
import { fromGatewayView } from '@/lib/api/ip-filter-action-map';
import type { DemoAction, DemoBlacklistAction, DemoWhitelistAction, HeaderKV, IPFilterAction, IPFilterListType } from '@/types/ip-filter';

// 单次导入的硬上限（原型明确「单次不超过1000条」）。
export const MAX_IMPORT_ROWS = 1000;

// 每行解析后的类别 —— 决定提交时用哪个 ip_config_type。
export type ImportIpKind = 'single' | 'range';

// 与现有规则/批内其它行的重复关系。
export type ImportDuplicateKind = 'none' | 'in_batch' | 'existing';

export interface ParsedImportRow {
  // 1 起的原始行号（含被跳过的空行不计入，只计非空行），用于预览定位。
  lineNo: number;
  raw: string;
  // 解析出的规范化 IP 文本（single 为 IP/CIDR，range 为 a-b）。
  ipValue: string;
  kind: ImportIpKind;
  action: DemoAction;
  remark: string;
  // 非空即该行非法，值为 i18n 错误码。
  error: string | null;
  // 与既有规则或批内前序行的重复关系。
  duplicate: ImportDuplicateKind;
  // 仅 JSON（导出格式）来源的行携带：保留导出文件里的原始规则属性，
  // 使 导出→导入 闭环不丢 name/priority/启用状态。
  name?: string;
  priority?: number;
  isActive?: boolean;
}

// CSV 动作列（中英与内部词表都接受）→ demo 动作。空/未知留给调用方回退到「默认动作」。
const ACTION_ALIASES: Record<string, DemoAction> = {
  block: 'block', 阻断: 'block', 拦截: 'block',
  quarantine: 'quarantine', 隔离: 'quarantine',
  drop: 'drop', 丢弃: 'drop',
  review: 'review', 审核: 'review',
  deliver: 'deliver', 放行: 'deliver', 投递: 'deliver',
  tagdeliver: 'tagDeliver', 标记投递: 'tagDeliver', 标记: 'tagDeliver',
};

const BLACKLIST_ACTIONS: ReadonlySet<DemoAction> = new Set<DemoBlacklistAction>(['block', 'quarantine', 'drop', 'review']);
const WHITELIST_ACTIONS: ReadonlySet<DemoAction> = new Set<DemoWhitelistAction>(['deliver', 'tagDeliver']);

/** 该动作是否属于目标名单（黑名单页不能导入白名单动作，反之亦然）。 */
export function actionMatchesListType(action: DemoAction, listType: IPFilterListType): boolean {
  return listType === 'blacklist' ? BLACKLIST_ACTIONS.has(action) : WHITELIST_ACTIONS.has(action);
}

/** 解析 CSV 的动作列文本；返回 null 表示空或无法识别（调用方回退默认动作）。 */
export function parseActionAlias(text: string): DemoAction | null {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  return ACTION_ALIASES[key] ?? null;
}

// 归一化 IP 文本用于去重比较：IPv6 大小写归一，与后端 canonical 同构。
function dedupKey(ipValue: string): string {
  return ipValue.toLowerCase();
}

// 解析单个 IP token（单 IP / CIDR / 区间），复用规则表单的判定口径。
function parseIpToken(token: string): { ipValue: string; kind: ImportIpKind } | { error: string } {
  const s = token.trim();
  if (!s) return { error: 'importEmptyIp' };

  if (s.includes('/')) {
    const [ipStr, prefixStr, extra] = s.split('/');
    if (!ipStr || !prefixStr || extra !== undefined || !/^\d+$/.test(prefixStr) || !isValidIP(ipStr)) {
      return { error: 'importInvalidIp' };
    }
    const maxPrefix = isValidIPv6(ipStr) ? 128 : 32;
    if (Number(prefixStr) > maxPrefix) return { error: 'importInvalidIp' };
    return { ipValue: s, kind: 'single' };
  }

  const dash = s.indexOf('-');
  if (dash >= 0) {
    const start = s.slice(0, dash).trim();
    const end = s.slice(dash + 1).trim();
    if (!isValidIP(start) || !isValidIP(end)) return { error: 'importInvalidRange' };
    if (isValidIP(start) && isValidIPv6(start) !== isValidIPv6(end)) return { error: 'importInvalidRange' };
    return { ipValue: `${start}-${end}`, kind: 'range' };
  }

  if (!isValidIP(s)) return { error: 'importInvalidIp' };
  return { ipValue: s, kind: 'single' };
}

// 一行原始文本 → { ip, action?, remark? }。
// 文本粘贴模式每行只有 IP；CSV 模式为 "IP,动作,备注"。两者统一按逗号/制表切分，
// 只有一列时视为纯 IP。
function splitRow(raw: string): { ip: string; action: string; remark: string } {
  const cols = raw.split(/[,\t]/);
  return {
    ip: (cols[0] ?? '').trim(),
    action: (cols[1] ?? '').trim(),
    remark: (cols[2] ?? '').trim(),
  };
}

export interface ParseImportOptions {
  listType: IPFilterListType;
  // 无动作列时（及 CSV 动作为空/未识别时）回退的默认动作。
  defaultAction: DemoAction;
  // 既有规则里已存在的 IP 文本集合（用于标记 existing 重复）。调用方传入已归一化前的原文即可。
  existingIpValues: Iterable<string>;
}

export interface ParseImportResult {
  rows: ParsedImportRow[];
  total: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  // 超过 MAX_IMPORT_ROWS 时为 true，rows 已被截断到上限，调用方应拒绝导入。
  exceededLimit: boolean;
}

// 预解析行：尚未做去重标记与行号分配（由 assembleResult 统一完成）。
type PreRow = Omit<ParsedImportRow, 'lineNo' | 'duplicate'>;

// 文本粘贴区 → 预解析行（每行 "IP[,动作[,备注]]"）。
function textToPreRows(text: string, opts: ParseImportOptions): PreRow[] {
  const rows: PreRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const { ip, action: actionText, remark } = splitRow(line);
    const parsed = parseIpToken(ip);

    if ('error' in parsed) {
      rows.push({ raw: line, ipValue: ip, kind: 'single', action: opts.defaultAction, remark, error: parsed.error });
      continue;
    }

    const alias = parseActionAlias(actionText);
    const action = alias ?? opts.defaultAction;

    // 动作与目标名单不符（如黑名单页导入了白名单动作）视为非法，避免静默落到错误名单。
    if (!actionMatchesListType(action, opts.listType)) {
      rows.push({ raw: line, ipValue: parsed.ipValue, kind: parsed.kind, action, remark, error: 'importActionListMismatch' });
      continue;
    }

    rows.push({ raw: line, ipValue: parsed.ipValue, kind: parsed.kind, action, remark, error: null });
  }
  return rows;
}

// 预解析行合集 → 最终预览：统一分配行号、按上限截断、做批内/既有去重标记并汇总。
function assembleResult(preRows: PreRow[], opts: ParseImportOptions): ParseImportResult {
  const existing = new Set<string>();
  for (const v of opts.existingIpValues) existing.add(dedupKey(v.trim()));

  const rows: ParsedImportRow[] = [];
  const seenInBatch = new Set<string>();
  let exceededLimit = false;

  for (const pre of preRows) {
    if (rows.length >= MAX_IMPORT_ROWS) {
      exceededLimit = true;
      break;
    }
    const lineNo = rows.length + 1;
    if (pre.error) {
      rows.push({ ...pre, lineNo, duplicate: 'none' });
      continue;
    }
    const key = dedupKey(pre.ipValue);
    let duplicate: ImportDuplicateKind = 'none';
    if (seenInBatch.has(key)) duplicate = 'in_batch';
    else if (existing.has(key)) duplicate = 'existing';
    seenInBatch.add(key);
    rows.push({ ...pre, lineNo, duplicate });
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.filter((r) => r.error).length;
  const duplicateCount = rows.filter((r) => !r.error && r.duplicate !== 'none').length;

  return {
    rows,
    total: rows.length,
    validCount,
    errorCount,
    duplicateCount,
    exceededLimit,
  };
}

/**
 * 解析整段导入文本，产出逐行预览。
 *
 * 去重语义（对齐原型「重复IP自动去重」）：
 *   - in_batch：与本批更早一条有效行的 IP 归一化后相同 —— 后出现者标记，提交时天然跳过。
 *   - existing：与既有规则的 IP 相同 —— 是否覆盖/跳过由调用方按用户选择决定。
 * 非法行不参与去重判定（它压根不会被提交）。
 */
export function parseImportText(text: string, opts: ParseImportOptions): ParseImportResult {
  return parseImportInputs({ text, envelopeRows: [] }, opts);
}

/**
 * 文本粘贴 + JSON 文件（导出格式）两个来源的合并预览。
 * 文本行在前、文件行在后，去重与 1000 条上限跨来源统一生效。
 */
export function parseImportInputs(
  inputs: { text: string; envelopeRows: EnvelopeRuleRow[] },
  opts: ParseImportOptions,
): ParseImportResult {
  const preRows: PreRow[] = [
    ...textToPreRows(inputs.text, opts),
    ...inputs.envelopeRows,
  ];
  return assembleResult(preRows, opts);
}

// ===== 导出 JSON（rule-settings/v1 envelope）导入解析（GT-12137 复开：导入格式与导出一致） =====

// JSON 文件里的一条规则解析后的形态：与 PreRow 同构（进同一条预览/去重管线）。
export type EnvelopeRuleRow = PreRow;

interface EnvelopeRuleInput {
  name?: unknown;
  description?: unknown;
  action?: unknown;
  priority?: unknown;
  is_active?: unknown;
  metadata?: unknown;
}

// envelope 级失败（整份文件不可用）返回 { error }；否则返回逐条规则行（行内错误在行上标注）。
export type ParseEnvelopeResult = { rules: EnvelopeRuleRow[] } | { error: string };

/**
 * 解析「导出」产出的 rule-settings/v1 JSON envelope（与 handleExport 下载的文件同构）：
 *   { version, scope: "ip_filter", data: { rules: [ { name, action, metadata, ... } ] } }
 * 也接受裸 { rules: [...] }（与后端 importIPFilterRules 的宽容度一致）。
 *
 * 行级规则：
 *   - metadata（字符串或对象）必须是 feature=ip_filter 的 IP 规则，否则 importJsonBadRule；
 *   - metadata.list_type 与当前页不符 → importListTypeMismatch（黑名单文件不允许静默导进白名单）；
 *   - expression 类型引用 IP 组（跨环境组 ID 不可靠）→ importExpressionUnsupported，预览可见但不导入；
 *   - IP 文本复用 parseIpToken 校验；动作经 fromGatewayView 反查回 demo 词表。
 */
export function parseExportEnvelope(jsonText: string, listType: IPFilterListType): ParseEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { error: 'importJsonInvalid' };
  }
  if (!parsed || typeof parsed !== 'object') return { error: 'importJsonInvalid' };

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.scope === 'string' && obj.scope !== 'ip_filter') {
    return { error: 'importJsonWrongScope' };
  }
  const data = (obj.data && typeof obj.data === 'object') ? (obj.data as Record<string, unknown>) : obj;
  const rules = data.rules;
  if (!Array.isArray(rules)) return { error: 'importJsonNotEnvelope' };

  const rows: EnvelopeRuleRow[] = [];
  for (const item of rules) {
    const rule = (item && typeof item === 'object') ? (item as EnvelopeRuleInput) : ({} as EnvelopeRuleInput);
    const name = typeof rule.name === 'string' ? rule.name : '';
    const remark = typeof rule.description === 'string' ? rule.description : '';
    const priority = typeof rule.priority === 'number' && Number.isFinite(rule.priority) ? rule.priority : undefined;
    const isActive = typeof rule.is_active === 'boolean' ? rule.is_active : undefined;
    const badRule = (raw: string): EnvelopeRuleRow => ({
      raw, ipValue: raw, kind: 'single', action: listType === 'blacklist' ? 'block' : 'deliver',
      remark, error: 'importJsonBadRule', name: name || undefined, priority, isActive,
    });

    let meta: Record<string, unknown> | null = null;
    if (typeof rule.metadata === 'string') {
      try {
        const m = JSON.parse(rule.metadata);
        if (m && typeof m === 'object') meta = m as Record<string, unknown>;
      } catch { /* fallthrough → badRule */ }
    } else if (rule.metadata && typeof rule.metadata === 'object') {
      meta = rule.metadata as Record<string, unknown>;
    }
    if (!meta || meta.feature !== 'ip_filter' || typeof meta.ip_value !== 'string') {
      rows.push(badRule(name || '(rule)'));
      continue;
    }

    const ipValue = meta.ip_value;
    const base = {
      raw: ipValue, remark, name: name || undefined, priority, isActive,
    };

    if (meta.list_type !== listType) {
      rows.push({ ...base, ipValue, kind: 'single', action: listType === 'blacklist' ? 'block' : 'deliver', error: 'importListTypeMismatch' });
      continue;
    }
    if (meta.ip_config_type === 'expression') {
      rows.push({ ...base, ipValue, kind: 'single', action: listType === 'blacklist' ? 'block' : 'deliver', error: 'importExpressionUnsupported' });
      continue;
    }

    const addHeaders = Array.isArray(meta.add_headers) ? (meta.add_headers as HeaderKV[]) : undefined;
    const action = fromGatewayView((typeof rule.action === 'string' ? rule.action : '') as IPFilterAction, addHeaders, listType);

    const tokenParsed = parseIpToken(ipValue);
    if ('error' in tokenParsed) {
      rows.push({ ...base, ipValue, kind: 'single', action, error: tokenParsed.error });
      continue;
    }
    // 手工改过的文件里动作可能与名单不符（如黑名单文件里 accept），沿用文本路径的同款拦截。
    if (!actionMatchesListType(action, listType)) {
      rows.push({ ...base, ipValue: tokenParsed.ipValue, kind: tokenParsed.kind, action, error: 'importActionListMismatch' });
      continue;
    }

    rows.push({ ...base, ipValue: tokenParsed.ipValue, kind: tokenParsed.kind, action, error: null });
  }

  return { rules: rows };
}

export type ExistingDuplicateStrategy = 'skip' | 'overwrite';

export interface ImportPlanRow {
  ipValue: string;
  kind: ImportIpKind;
  action: DemoAction;
  remark: string;
  // overwrite：existing 重复且策略为覆盖 —— 需更新既有规则而非新建。
  mode: 'create' | 'overwrite';
  // JSON（导出格式）来源的行保留原始规则属性（见 ParsedImportRow）。
  name?: string;
  priority?: number;
  isActive?: boolean;
}

/**
 * 从预览结果 + 用户选择的「既有重复」策略，产出实际要执行的导入计划。
 *
 * 过滤规则：
 *   - 非法行：永不提交。
 *   - in_batch 重复：永远跳过（同批已有一条，去重）。
 *   - existing 重复：strategy=skip 跳过；strategy=overwrite 标记为 overwrite。
 */
export function buildImportPlan(
  rows: ParsedImportRow[],
  strategy: ExistingDuplicateStrategy,
): ImportPlanRow[] {
  const plan: ImportPlanRow[] = [];
  for (const r of rows) {
    if (r.error) continue;
    if (r.duplicate === 'in_batch') continue;
    if (r.duplicate === 'existing' && strategy === 'skip') continue;
    plan.push({
      ipValue: r.ipValue,
      kind: r.kind,
      action: r.action,
      remark: r.remark,
      mode: r.duplicate === 'existing' ? 'overwrite' : 'create',
      name: r.name,
      priority: r.priority,
      isActive: r.isActive,
    });
  }
  return plan;
}
