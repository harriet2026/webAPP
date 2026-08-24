import type { FieldDef } from '@/types/unified-rules';
import type { ConditionLeaf } from './serde';
import type { PrimaryAction } from './conflict-matrix';

// Stage ordering used purely for this submit-time derivation (independent of
// the full engine STAGE_ORDER, per the brief): mail < rcpt < header < data.
// 'sideline' is a special value handled by its own branch, not part of this
// ordering.
const STAGE_ORDER = ['mail', 'rcpt', 'header', 'data'];

function maxStage(a: string, b: string): string {
  const ia = STAGE_ORDER.indexOf(a);
  const ib = STAGE_ORDER.indexOf(b);
  // Unknown stage names never win over a known one.
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia >= ib ? a : b;
}

const DATA_ONLY_ACTIONS: PrimaryAction[] = ['quarantine', 'audit', 'discard', 'proceed'];

/**
 * Derive the rule's persisted stage from its conditions and primary action.
 * Called only at submit time — there is no UI gating tied to this.
 *
 * Precedence:
 * 1. Any leaf whose field has availability === 'sideline_async' → 'sideline'.
 * 2. Else, if the action is one of quarantine/audit/discard/proceed → 'data'.
 * 3. Else, the max of all leaves' fieldDefs[field].min_stage, floored at 'data'.
 *    Empty leaves, or leaves with no matching/known stage, fall back to 'data'.
 */
export function deriveStage(
  leaves: ConditionLeaf[],
  fieldDefs: Record<string, FieldDef>,
  action: PrimaryAction,
): string {
  const hasSideline = leaves.some((l) => fieldDefs[l.field]?.availability === 'sideline_async');
  if (hasSideline) return 'sideline';

  if (DATA_ONLY_ACTIONS.includes(action)) return 'data';

  let stage = 'data';
  for (const leaf of leaves) {
    const minStage = fieldDefs[leaf.field]?.min_stage;
    if (minStage) stage = maxStage(stage, minStage);
  }
  return stage;
}
