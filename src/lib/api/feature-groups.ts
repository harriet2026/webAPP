import type { RuleNode } from '@/types/unified-rules';
import { GROUP_TAG_PREFIX } from '@/types/groups';
import type { ConditionGroups } from '@/components/security/advanced-filter-rules/serde';
import { serializeGroups } from '@/components/security/advanced-filter-rules/serde';

export type FeatureGroupConditions = ConditionGroups;

const DISALLOWED_FIELDS = new Set<string>(['feature_group']);
const DISALLOWED_STAGES = new Set<string>(['rcpt', 'sideline']);

export interface FeatureGroupPayload {
  name: string;
  description: string;
  stage: 'data';
  condition_tree: RuleNode;
  tags: string[];
  priority: number;
  is_active: boolean;
  page: 'groups';
  metadata: { group_type: 'feature' };
  rule_class?: 'tag';
}

export function buildFeatureGroupPayload(
  name: string,
  conditions: FeatureGroupConditions,
  isCreate: boolean,
): FeatureGroupPayload {
  const base: FeatureGroupPayload = {
    name,
    description: '',
    stage: 'data',
    // serializeGroups(./serde) returns null only for two empty groups; callers
    // gate submission on hasConditions before reaching here, so the fallback
    // is unreachable in practice — kept only to satisfy RuleNode's non-null
    // condition_tree type, matching the old pre-rewrite serializeGroups
    // (which returned `{type:'AND',children:[]}` for the empty case).
    condition_tree: serializeGroups(conditions) ?? { type: 'AND', children: [] },
    tags: [GROUP_TAG_PREFIX + name],
    priority: 100,
    is_active: true,
    page: 'groups',
    metadata: { group_type: 'feature' },
    rule_class: 'tag',
  };
  if (isCreate) return base;
  const updatePayload = { ...base };
  delete updatePayload.rule_class;
  return updatePayload;
}

export function isFieldAllowedForFeatureGroup(
  field: string,
  fieldDefs: Record<string, { min_stage?: string; supported?: boolean }>,
): boolean {
  if (DISALLOWED_FIELDS.has(field)) return false;
  const def = fieldDefs[field];
  if (!def || def.supported === false) return false;
  if (def.min_stage && DISALLOWED_STAGES.has(def.min_stage)) return false;
  return true;
}

export function findDisallowedFields(
  conditions: FeatureGroupConditions,
  fieldDefs: Record<string, { min_stage?: string; supported?: boolean }>,
): string[] {
  const out: string[] = [];
  for (const leaf of [...conditions.any, ...conditions.all]) {
    if (!leaf.field) continue;
    if (!isFieldAllowedForFeatureGroup(leaf.field, fieldDefs)) {
      out.push(leaf.field);
    }
  }
  return Array.from(new Set(out));
}
