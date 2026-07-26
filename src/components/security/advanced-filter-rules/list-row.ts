import type { Rule } from '@/types/unified-rules';
import type { PrimaryAction } from './conflict-matrix';

// list-row.ts — small metadata readers shared by AdvancedFilterRulesModule's
// list view. Mirrors the primary_action/scope key names established as the
// AdvancedRulesMetadata protocol in rule-form.ts (isPrimaryAction/isScope),
// but kept separate and dependency-light: the list only needs to *read* two
// fields off `rule.metadata`, not the full form-reconstruction machinery
// (deserializeGroups/parseAddons/...) that ruleToForm pulls in.

const PRIMARY_ACTIONS: PrimaryAction[] = [
  'none',
  'deliver',
  'tagDeliver',
  'quarantine',
  'review',
  'discard',
  'block',
];

export function parseRuleMetadata(metadata: Rule['metadata']): Record<string, unknown> | null {
  if (!metadata) return null;
  // The list serialiser returns `metadata` as an already-parsed object, while
  // create/get return it as a JSON string — accept both so the scope filter
  // (D-4) and the action column read correctly regardless of the source.
  if (typeof metadata === 'object') {
    return metadata as unknown as Record<string, unknown>;
  }
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getRulePrimaryAction(rule: Pick<Rule, 'metadata'>): PrimaryAction {
  const meta = parseRuleMetadata(rule.metadata);
  const pa = meta?.primary_action;
  return typeof pa === 'string' && (PRIMARY_ACTIONS as string[]).includes(pa) ? (pa as PrimaryAction) : 'none';
}

export function getRuleScope(rule: Pick<Rule, 'metadata'>): string[] {
  const meta = parseRuleMetadata(rule.metadata);
  const scope = meta?.scope;
  return Array.isArray(scope) ? scope.filter((s): s is string => typeof s === 'string') : [];
}
