import type { RuleNode } from '@/types/unified-rules';
import { CONDITIONS } from '@/components/security/advanced-filter-rules/catalogue';

// field → 条件目录 key（同一 field 复用首个命中的目录项，与 serde 的 remap 口径一致）
const FIELD_TO_CONDITION_KEY: Record<string, string> = {};
for (const def of CONDITIONS) {
  if (def.field && !(def.field in FIELD_TO_CONDITION_KEY)) {
    FIELD_TO_CONDITION_KEY[def.field] = def.key;
  }
}

// 特征组「条件预览」（demo buildFeaturePreview 口径）：
// serde 树（AND[OR[any],AND[all]] 或单组塌缩）→ "(A 或 B) 且 C" 式人类可读文案；
// t 取条件目录标签（advancedRulesFeature.v3Conditions.conditions.*），
// orWord/andWord 由调用方按语言注入（groups.previewOr/previewAnd）。
// 树不符合 serde 两组形态时返回 null，调用方回落到表达式摘要 summarizeConditionTree。
export function summarizeFeaturePreview(
  raw: string | RuleNode | null | undefined,
  labelOf: (conditionKey: string) => string,
  orWord: string,
  andWord: string,
): string | null {
  if (!raw) return null;
  let tree: RuleNode | null = null;
  try {
    tree = typeof raw === 'string' ? (JSON.parse(raw) as RuleNode) : raw;
  } catch {
    return null;
  }
  if (!tree) return null;

  const leafLabel = (n: RuleNode): string | null => {
    if (n.type !== 'condition' || !n.field) return null;
    const key = FIELD_TO_CONDITION_KEY[n.field];
    return key ? labelOf(key) : null;
  };
  const groupLabels = (n: RuleNode, kind: 'OR' | 'AND'): string[] | null => {
    if (n.type !== kind) return null;
    const out: string[] = [];
    for (const c of n.children ?? []) {
      const l = leafLabel(c);
      if (l == null) return null;
      out.push(l);
    }
    return out;
  };

  let orPart: string[] = [];
  let andPart: string[] = [];
  if (tree.type === 'AND' && (tree.children ?? []).length === 2
      && tree.children![0].type === 'OR' && tree.children![1].type === 'AND') {
    const o = groupLabels(tree.children![0], 'OR');
    const a = groupLabels(tree.children![1], 'AND');
    if (!o || !a) return null;
    orPart = o;
    andPart = a;
  } else if (tree.type === 'OR') {
    const o = groupLabels(tree, 'OR');
    if (!o) return null;
    orPart = o;
  } else if (tree.type === 'AND') {
    const a = groupLabels(tree, 'AND');
    if (!a) return null;
    andPart = a;
  } else {
    const l = leafLabel(tree);
    if (l == null) return null;
    andPart = [l];
  }

  const segments: string[] = [];
  if (orPart.length) segments.push(orPart.length > 1 ? `(${orPart.join(orWord)})` : orPart[0]);
  if (andPart.length) segments.push(...andPart);
  return segments.length ? segments.join(andWord) : null;
}

const OPS: Record<string, string> = {
  contain: 'contains',
  not_contain: 'not contains',
  within: 'in',
  not_within: 'not in',
  suffix: 'ends with',
  prefix: 'starts with',
  cidr: 'in CIDR',
  eq: '=',
  ne: '!=',
  gt: '>',
  lt: '<',
  ge: '>=',
  le: '<=',
  regex: 'matches',
};

function quoteValue(v: string): string {
  const trimmed = (v ?? '').replace(/\s+/g, ' ').trim();
  return trimmed.length > 40 ? `"${trimmed.slice(0, 37)}..."` : `"${trimmed}"`;
}

function summarizeNode(node: RuleNode): string {
  if (node.type === 'condition') {
    const op = (node.operator && OPS[node.operator]) || node.operator || '?';
    const field = node.field || '?';
    const value = quoteValue(node.value || '');
    return `${field} ${op} ${value}`;
  }
  if (node.type === 'NOT') {
    const child = node.children?.[0];
    return child ? `NOT (${summarizeNode(child)})` : 'NOT';
  }
  if (node.type === 'AND' || node.type === 'OR') {
    const parts = (node.children || []).map(summarizeNode).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts.map(p => p.includes(' ') && !p.startsWith('(') ? `(${p})` : p).join(` ${node.type} `);
  }
  return '';
}

export function summarizeConditionTree(raw: string | RuleNode | null | undefined): string {
  if (!raw) return '';
  let tree: RuleNode | null = null;
  try {
    tree = typeof raw === 'string' ? (JSON.parse(raw) as RuleNode) : raw;
  } catch {
    return '';
  }
  if (!tree) return '';
  const out = summarizeNode(tree);
  return out.length > 120 ? `${out.slice(0, 117)}...` : out;
}
