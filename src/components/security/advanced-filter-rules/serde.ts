import type { FieldDef, RuleNode } from '@/types/unified-rules';
import { CONDITIONS, type ConditionDef } from './catalogue';

// serde.ts — condition-tree ⇄ two-group (any/all) serialisation for the
// advanced filter rules ConditionsEditor (layer-3-conditions.html rewrite).
//
// Backend/rule_eval condition_tree semantics: root = AND[ OR[...any],
// AND[...all] ]; a leaf's `exclude` flag is represented as a NOT node
// wrapping the `condition` node. Single-group collapse: when only one of
// the two groups is non-empty, the outer AND wrapper is dropped so the tree
// is exactly that group's node (OR[...] or AND[...]) — not an AND with a
// single child. Two empty groups serialise to `null` (no condition_tree).

export interface ConditionLeaf {
  id: string;
  conditionKey: string;
  field: string;
  mapKey?: string;
  operator: string;
  value: string;
  exclude: boolean;
}

export interface ConditionGroups {
  any: ConditionLeaf[];
  all: ConditionLeaf[];
}

// MatchMode — the UI-facing "how does this condition match" vocabulary shown
// in the mode <Select>. It is distinct from ConditionLeaf.operator (the
// backend rule_eval operator string persisted on the RuleNode): several UI
// modes normalize to backend semantics that don't share the same name
// (contains → contain, matchAny → within, etc.), so the two mapping tables
// below are the single source of truth for that translation.
export type MatchMode =
  | 'contains' | 'notContains' | 'equals' | 'notEquals' | 'regex' | 'wildcard'
  | 'gt' | 'ge' | 'lt' | 'le' | 'between' | 'matchAny' | 'cidr';

export const MATCH_MODE_TO_OPERATOR: Record<MatchMode, string> = {
  contains: 'contain', notContains: 'not_contain', equals: 'eq', notEquals: 'ne',
  regex: 'match', wildcard: 'wildcard', gt: 'gt', ge: 'ge', lt: 'lt', le: 'le',
  between: 'between', matchAny: 'within', cidr: 'cidr',
};

export const OPERATOR_TO_MATCH_MODE: Record<string, MatchMode> = Object.fromEntries(
  Object.entries(MATCH_MODE_TO_OPERATOR).map(([m, o]) => [o, m as MatchMode]),
) as Record<string, MatchMode>;

function leafToNode(leaf: ConditionLeaf): RuleNode {
  const node: RuleNode = {
    type: 'condition',
    field: leaf.field,
    operator: leaf.operator,
    value: leaf.value,
  };
  if (leaf.mapKey) node.map_key = leaf.mapKey;
  // Persist the catalogue conditionKey so fields backing multiple catalogue
  // entries (e.g. urls ← url/urlDomain) can be disambiguated on reload.
  if (leaf.conditionKey) node.note = leaf.conditionKey;
  return leaf.exclude ? { type: 'NOT', children: [node] } : node;
}

function groupNode(type: 'AND' | 'OR', leaves: ConditionLeaf[]): RuleNode {
  return { type, children: leaves.map(leafToNode) };
}

export function serializeGroups(g: ConditionGroups): RuleNode | null {
  const hasAny = g.any.length > 0;
  const hasAll = g.all.length > 0;
  if (hasAny && hasAll) {
    return { type: 'AND', children: [groupNode('OR', g.any), groupNode('AND', g.all)] };
  }
  if (hasAny) return groupNode('OR', g.any);
  if (hasAll) return groupNode('AND', g.all);
  return null;
}

let seq = 0;
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  seq += 1;
  return `leaf-${Date.now()}-${seq}`;
}

function nodeToLeaf(node: RuleNode): ConditionLeaf {
  let exclude = false;
  let cond = node;
  if (node.type === 'NOT' && node.children?.[0]) {
    exclude = true;
    cond = node.children[0];
  }
  return {
    id: genId(),
    conditionKey: cond.note || cond.field || '',
    field: cond.field ?? '',
    mapKey: cond.map_key,
    operator: cond.operator ?? '',
    value: cond.value ?? '',
    exclude,
  };
}

function isConditionLike(n: RuleNode | undefined): boolean {
  return !!n && (n.type === 'condition' || n.type === 'NOT');
}

export function deserializeGroups(tree: RuleNode | null | undefined): ConditionGroups {
  const out: ConditionGroups = { any: [], all: [] };
  if (!tree) return out;

  const leavesOf = (n: RuleNode): ConditionLeaf[] => (n.children ?? []).map(nodeToLeaf);

  if (tree.type === 'AND' && (tree.children ?? []).some((c) => c.type === 'OR')) {
    // Canonical shape: AND[ OR[...any], AND[...all] ] (or just OR alone, or
    // OR plus stray condition leaves living directly under the outer AND —
    // tolerate and fold those into `all`).
    for (const child of tree.children ?? []) {
      if (child.type === 'OR') {
        out.any = leavesOf(child);
      } else if (child.type === 'AND') {
        out.all.push(...leavesOf(child));
      } else if (isConditionLike(child)) {
        out.all.push(nodeToLeaf(child));
      }
    }
    return out;
  }

  if (tree.type === 'OR') {
    out.any = leavesOf(tree);
    return out;
  }

  if (tree.type === 'AND') {
    // Historical/flat tree: AND of plain condition leaves (no nested OR) →
    // treat the whole thing as the "all" group.
    for (const child of tree.children ?? []) {
      if (isConditionLike(child)) out.all.push(nodeToLeaf(child));
      else if (child.type === 'OR') out.any.push(...leavesOf(child));
      else if (child.type === 'AND') out.all.push(...leavesOf(child));
    }
    return out;
  }

  if (isConditionLike(tree)) {
    // Bare root condition (no AND/OR wrapper) — treat as a single "all" leaf
    // so hand-edited / legacy trees are not silently dropped on load.
    out.all = [nodeToLeaf(tree)];
    return out;
  }

  return out;
}

export function remapLeavesToCatalogueKey(
  leaves: ConditionLeaf[],
  defs: ConditionDef[] = CONDITIONS,
): ConditionLeaf[] {
  return leaves.map((leaf) => {
    // If the persisted conditionKey is itself a valid catalogue entry for
    // this field, keep it as-is.
    const asIs = defs.find((d) => d.key === leaf.conditionKey);
    if (asIs && asIs.field === leaf.field) return leaf;

    // Otherwise fall back to the field, preferring 'url' over 'urlDomain'
    // when both catalogue entries share the same field (urls). This is the
    // one field with more than one catalogue key, so pin the default to the
    // first entry in catalogue order (which is 'url').
    const candidates = defs.filter((d) => d.field === leaf.field);
    if (candidates.length === 0) return { ...leaf };
    const chosen = candidates[0];
    return { ...leaf, conditionKey: chosen.key };
  });
}

// defaultModeForField — picks the MatchMode a freshly-added condition leaf
// should default to for a given field, preferring the field's own override
// (e.g. send_time → between) then a type-based preference order, then
// whatever operator the field actually supports.
const FALLBACK_MODE_PREFERENCE: MatchMode[] = ['equals', 'matchAny'];

function modePreferencesForType(type: string): MatchMode[] {
  if (type === 'ip') return ['cidr', 'matchAny', 'equals'];
  if (type === 'number') return ['gt', 'between', 'equals'];
  if (type === 'boolean' || type.startsWith('map_')) return ['equals', 'matchAny'];
  return ['contains', 'equals', 'matchAny'];
}

// Fields where the default mode should override the type-based preference.
const FIELD_DEFAULT_MODE: Record<string, MatchMode> = {
  send_time: 'between',
  // send_dow is a numeric field, but `between` (auto-added to all number fields)
  // is wrong for a weekday set — its natural mode is multi-select (within).
  send_dow: 'matchAny',
};

export function defaultModeForField(def: FieldDef, fieldName?: string): MatchMode {
  const ops = new Set(def.operators ?? []);
  if (fieldName && FIELD_DEFAULT_MODE[fieldName]) {
    const preferred = FIELD_DEFAULT_MODE[fieldName];
    if (ops.has(MATCH_MODE_TO_OPERATOR[preferred])) return preferred;
  }
  for (const mode of modePreferencesForType(def.type)) {
    if (ops.has(MATCH_MODE_TO_OPERATOR[mode])) return mode;
  }
  for (const mode of FALLBACK_MODE_PREFERENCE) {
    if (ops.has(MATCH_MODE_TO_OPERATOR[mode])) return mode;
  }
  return 'equals';
}

// ── 意图引擎（综合研判引擎）取值编解码 ─────────────────────────────────────
// 「意图引擎」条件（catalogue key comprehensiveEngineResult / field cac_tag）与
// 阶段3内容层的意图引擎模块同源，支持两种配置模式（对齐 IntentCard 的 detectionMode）：
//   - classification 分类优先：命中所选意图分类集合任意其一（intents ⊆ INTENT_TYPES），
//     operator = 'within'；
//   - threshold 分段阈值：置信度分数落入 [lo, hi] ⊆ [0,1] 区间，operator = 'between'。
// 单值 leaf.value 用「模式前缀 + 载荷」编码，既复用现有 string value 模型 / serde
// 往返、又能在配置面板与表达式预览间无歧义解析：
//   classification:phishing,spam   /   threshold:0.60,0.90
export type IntentEngineMode = 'classification' | 'threshold';

export interface IntentEngineValue {
  mode: IntentEngineMode;
  intents: string[];
  lo: string;
  hi: string;
}

export const INTENT_ENGINE_OPERATOR: Record<IntentEngineMode, string> = {
  classification: 'within',
  threshold: 'between',
};

export function parseIntentEngineValue(value: string): IntentEngineValue {
  const raw = value ?? '';
  const idx = raw.indexOf(':');
  const prefix = idx >= 0 ? raw.slice(0, idx) : '';
  const payload = idx >= 0 ? raw.slice(idx + 1) : raw;
  if (prefix === 'threshold') {
    const [lo = '', hi = ''] = payload.split(',');
    return { mode: 'threshold', intents: [], lo: lo.trim(), hi: hi.trim() };
  }
  // 'classification' 前缀，或无前缀的历史值（尽力当作意图 token 列表解析，不丢数据）。
  const intents = payload.split(',').map((s) => s.trim()).filter((s) => s !== '');
  return { mode: 'classification', intents, lo: '', hi: '' };
}

export function encodeIntentEngineValue(v: IntentEngineValue): string {
  if (v.mode === 'threshold') return `threshold:${v.lo.trim()},${v.hi.trim()}`;
  return `classification:${v.intents.join(',')}`;
}
