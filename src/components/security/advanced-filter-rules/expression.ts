import { CONDITIONS, type ConditionDef, type PanelKind } from './catalogue';
import { OPERATOR_TO_MATCH_MODE, type ConditionLeaf, type ConditionGroups } from './serde';

// expression.ts — pure functions backing the right-column "logic expression
// preview" of the three-column conditions editor (layer-3-conditions.html
// §「右栏：逻辑表达式预览」). No React/JSX here so this stays trivially unit
// testable; ExpressionPreview.tsx renders the structured LeafSummary with
// color/markup, buildExpressionText renders the plain-text mono block.

function defFor(leaf: ConditionLeaf): ConditionDef | undefined {
  return CONDITIONS.find((d) => d.key === leaf.conditionKey);
}

// Multi-line values (text/mime/cidr panels) are stored newline-joined in
// leaf.value (see ConditionConfigPanel.tsx); split back into a display list.
export function splitDisplayValues(value: string): string[] {
  return value
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

// Panels whose leaf.value is never "empty" in the configuration-incomplete
// sense — a number leaf always carries a real value once created (default
// 0), matching the demo's `c.kind === 'num' ? false : ...` rule.
function panelNeedsValueForCompleteness(panel: PanelKind | undefined): boolean {
  return panel !== 'number';
}

export interface LeafSummary {
  leaf: ConditionLeaf;
  def: ConditionDef | undefined;
  panel: PanelKind | undefined;
  envelope: boolean;
  /** Display name: raw catalogue key for envelope conditions, else i18n label. */
  name: string;
  /** i18n-translated operator word (matchModes.*), falls back to the raw operator string. */
  operatorLabel: string;
  /** map_* 字段指向的键名（已剥掉 grp: 前缀）；非 map 条件或通配 '*' 时为空串。 */
  mapKeyLabel: string;
  /** Parsed multi-line values (for text/mime/cidr/weekday), or single-value / between pair otherwise. */
  values: string[];
  /** How many trailing values are folded into "+N" beyond the first two shown. */
  foldedCount: number;
  incomplete: boolean;
  /**
   * 已翻译的精细诊断文案列表：指出「缺哪个字段 / 合法区间 / 超出有效范围」等，
   * 供预览逐条展示，替代原先扁平的「配置不完整」。incomplete 为真时至少含一条
   * 阻断性原因；即使 incomplete 为假，也可能含「超出建议范围」这类提示性原因。
   */
  incompleteReasons: string[];
  exclude: boolean;
}

// 数值面板的取值诊断：返回 { incomplete, reasons }。incomplete 表示存在阻断性
// 缺失（必填阈值/区间端点为空）；reasons 为逐条已翻译文案，含缺失与超范围提示。
// def.meta 提供 min/max 用于范围校验（缺省则跳过范围检查）。
function diagnoseNumber(
  leaf: ConditionLeaf,
  meta: { min?: number; max?: number } | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): { incomplete: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const inRange = (n: number) =>
    (meta?.min === undefined || n >= meta.min) && (meta?.max === undefined || n <= meta.max);
  const rangeText = () =>
    t('incompleteReasonRange', {
      min: meta?.min ?? Number.NEGATIVE_INFINITY,
      max: meta?.max ?? Number.POSITIVE_INFINITY,
    });

  if (leaf.operator === 'between') {
    const [loRaw, hiRaw] = leaf.value.split(',');
    const lo = (loRaw ?? '').trim();
    const hi = (hiRaw ?? '').trim();
    if (lo === '' || hi === '') {
      reasons.push(t('incompleteReasonBetween'));
      return { incomplete: true, reasons };
    }
    const loN = Number(lo);
    const hiN = Number(hi);
    if (Number.isFinite(loN) && Number.isFinite(hiN) && loN > hiN) reasons.push(t('incompleteReasonBetweenOrder'));
    if ((Number.isFinite(loN) && !inRange(loN)) || (Number.isFinite(hiN) && !inRange(hiN))) reasons.push(rangeText());
    return { incomplete: false, reasons };
  }

  const raw = (leaf.value.split(',')[0] ?? '').trim();
  if (raw === '') {
    reasons.push(t('incompleteReasonThreshold'));
    return { incomplete: true, reasons };
  }
  const n = Number(raw);
  if (Number.isFinite(n) && !inRange(n)) reasons.push(rangeText());
  return { incomplete: false, reasons };
}


// mapKeyDisplayName 取出 map 条件里可读的键名。群组类映射键的形态是
// `grp:<群组名>`（见 ListGroupsMeta / ListFeatureGroupsMeta 返回的 items.id），
// 展示时剥掉前缀只留群组名，与 MapKeySelect 下拉里的 label 保持一致。
export function mapKeyDisplayName(leaf: ConditionLeaf): string {
  const key = (leaf.mapKey ?? '').trim();
  if (!key || key === '*') return '';
  return key.startsWith('grp:') ? key.slice('grp:'.length) : key;
}

export function summarizeLeaf(
  leaf: ConditionLeaf,
  t: (key: string, values?: Record<string, string | number>) => string,
): LeafSummary {
  const def = defFor(leaf);
  const panel = def?.panel;
  const envelope = !!def?.envelope;
  const baseName = envelope ? leaf.conditionKey || leaf.field : t(`v3Conditions.conditions.${leaf.conditionKey}`);
  // GT-12261：map_* 字段（特征组 / 发信人组 / IP组 / RBL 等）真正指向哪个键，
  // 全靠 leaf.mapKey。此前 summarizeLeaf 完全没读它，于是所有 map 条件都渲染成
  // 「<字段名> 等于 true」——重开规则时看不出绑定的是哪个组，看着就像条件退化成了
  // 布尔值（后端往返实测 map_key 一直完好，丢的只是这里的展示）。
  // '*' 是通配（任意键），保持原样不加后缀，避免改变 RBL 等既有条件的显示。
  const mapKeyLabel = mapKeyDisplayName(leaf);
  const name = mapKeyLabel ? `${baseName}[${mapKeyLabel}]` : baseName;

  const mode = OPERATOR_TO_MATCH_MODE[leaf.operator];
  const operatorLabel = mode ? t(`v3Conditions.matchModes.${mode}`) : leaf.operator;

  let values: string[];
  if (leaf.operator === 'between') {
    values = leaf.value.split(',').map((v) => v.trim());
  } else if (panel === 'text' || panel === 'mime' || panel === 'cidr' || panel === 'weekday' || panel === 'orgDept') {
    values = splitDisplayValues(leaf.value);
  } else {
    values = leaf.value.trim() === '' ? [] : [leaf.value.trim()];
  }

  const shown = values.slice(0, 2);
  const foldedCount = values.length > 2 ? values.length - 2 : 0;

  // 诊断：数值面板走 diagnoseNumber（修复此前 number 恒判「完整」的缺陷——空
  // 阈值/缺区间端点现在会被判为不完整并给出具体原因 + 超范围提示）；其余面板
  // 沿用原「必填且全空即不完整」规则，并补一条通用缺失原因文案。
  let incomplete: boolean;
  let incompleteReasons: string[];
  if (panel === 'number') {
    const diag = diagnoseNumber(leaf, def?.meta, t);
    incomplete = diag.incomplete;
    incompleteReasons = diag.reasons;
  } else {
    const needsValue = panelNeedsValueForCompleteness(panel);
    incomplete = needsValue && values.every((v) => v.trim() === '');
    incompleteReasons = incomplete ? [t('incompleteReasonMissingValue')] : [];
  }

  return {
    leaf,
    def,
    panel,
    envelope,
    name,
    operatorLabel,
    mapKeyLabel,
    values: shown,
    foldedCount,
    incomplete,
    incompleteReasons,
    exclude: leaf.exclude,
  };
}

const INCOMPLETE_TOKEN = '__INCOMPLETE__';

// Plain-text rendering of a single leaf's brief row, e.g.:
//   URL数量 大于等于 "5"
//   发信人 包含 "a", "b" +1 (NOT)
// incompleteMarker/notMarker are injected by the caller (i18n) so this stays
// a pure function of its inputs.
export function renderBriefLine(
  summary: LeafSummary,
  opts: { incompleteMarker: string; notMarker: string },
): string {
  const valueText = summary.incomplete
    ? opts.incompleteMarker
    : summary.values.map((v) => `"${v}"`).join(', ') + (summary.foldedCount > 0 ? ` +${summary.foldedCount}` : '');
  const parts = [summary.name, summary.operatorLabel, valueText];
  const line = parts.join(' ');
  return summary.exclude ? `${line} ${opts.notMarker}` : line;
}

function exprValueText(summary: LeafSummary): string {
  if (summary.incomplete) return INCOMPLETE_TOKEN;
  return summary.values.map((v) => `"${v}"`).join(', ');
}

function exprLeafText(leaf: ConditionLeaf, t: (key: string) => string, incompleteMarker: string): string {
  const summary = summarizeLeaf(leaf, t);
  const valueText = exprValueText(summary).replace(INCOMPLETE_TOKEN, incompleteMarker);
  const inner = `${summary.name} ${summary.operatorLabel}${valueText ? ` ${valueText}` : ''}`;
  return summary.exclude ? `NOT (${inner})` : inner;
}

// buildExpressionText — the bottom-of-panel "完整表达式" mono block:
//   ((leaf OR leaf))
//   AND
//   ((leaf AND leaf))
// Either group collapses to its own block alone when the other is empty;
// both empty => ''.
export function buildExpressionText(groups: ConditionGroups, t: (key: string) => string): string {
  const incompleteMarker = t('incompleteCondition');
  const orParts = groups.any.map((leaf) => exprLeafText(leaf, t, incompleteMarker));
  const andParts = groups.all.map((leaf) => exprLeafText(leaf, t, incompleteMarker));

  const orBlock = orParts.length > 0 ? `((${orParts.join(' OR ')}))` : '';
  const andBlock = andParts.length > 0 ? `((${andParts.join(' AND ')}))` : '';

  if (orBlock && andBlock) return `${orBlock}\nAND\n${andBlock}`;
  return orBlock || andBlock;
}
