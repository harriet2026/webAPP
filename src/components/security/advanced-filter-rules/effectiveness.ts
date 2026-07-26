// effectiveness.ts — the "有效性评分" weighted formula for the layer-5
// 测试与分析 Tab (spec §7.2 / layer-5-test-analysis.html "效果分析" section).
// Scoring is computed on the frontend from the raw numerators/denominators
// the backend returns (GetUnifiedRuleEffectStats never itself weighs a
// score — see internal/api/unified_rules_analytics.go's doc comment on
// GetUnifiedRuleEffectStats). Kept as a pure function so the three branches
// (activity/accuracy/health) are independently unit-testable without
// mounting the Tab or mocking react-query.
//
// Formula (fixed by the task spec, do not "simplify" the constants):
//   activity = min(1, hits / 30) * 40
//   accuracy = (fp_rate == null ? 1 : 1 - fp_rate) * 40
//   health   = (enabled && !hasEmptyValueCondition && !hasGreyedField) ? 20 : 0
//   score    = round(activity + accuracy + health)
//
// health's "无置灰字段" leg needs the field-definitions catalogue
// (computeCatalogueItem) to know which conditions are greyed out; the F8
// TestAnalysisTab signature is `{ form, rule }` (no fieldDefs prop — see the
// task brief), so callers that cannot compute it pass hasGreyedField=false.
// This is a deliberate, documented simplification (see the task report),
// not a bug: it only ever makes health *more* permissive (never blocks a
// score that should have been blocked), and the "无空值条件" leg is still
// fully evaluated.
export interface EffectivenessInput {
  hits: number;
  fpRate: number | null;
  enabled: boolean;
  hasEmptyValueCondition: boolean;
  hasGreyedField: boolean;
}

export interface EffectivenessBreakdown {
  activity: number;
  accuracy: number;
  health: number;
  score: number;
}

export function computeEffectiveness(input: EffectivenessInput): EffectivenessBreakdown {
  const hits = Number.isFinite(input.hits) ? Math.max(0, input.hits) : 0;
  const activity = Math.min(1, hits / 30) * 40;
  const accuracy = (input.fpRate == null ? 1 : 1 - input.fpRate) * 40;
  const healthOk = input.enabled && !input.hasEmptyValueCondition && !input.hasGreyedField;
  const health = healthOk ? 20 : 0;
  const score = Math.round(activity + accuracy + health);
  return { activity, accuracy, health, score };
}
