import type { RuleNode } from '@/types/unified-rules';

// Pure condition-tree helpers for the outbound routing tab. Extracted from the
// component so they can be unit-tested in isolation (review M3).

/** The fixed is_outbound = true condition injected at submit. */
export const IS_OUTBOUND_NODE: RuleNode = {
  type: 'condition',
  field: 'is_outbound',
  operator: 'eq',
  value: 'true',
};

/** Default user-editable condition tree (is_outbound auto-injected on submit). */
export const defaultUserTree = (): RuleNode => ({
  type: 'AND',
  children: [
    { type: 'condition', field: 'senderdomain', operator: 'eq', value: '' },
  ],
});

/**
 * Strip any existing is_outbound conditions from the tree (they are managed
 * by the component, not the user) before showing the builder.
 */
export function stripIsOutbound(node: RuleNode): RuleNode {
  if (node.type === 'AND' || node.type === 'OR') {
    const children = (node.children ?? []).filter(
      (c) => !(c.type === 'condition' && c.field === 'is_outbound'),
    );
    // Unwrap the AND wrapper that injectIsOutbound adds around a non-AND user
    // root (an OR group). After removing is_outbound, a lone group child IS the
    // user's original root, so restore it for editing instead of showing a
    // redundant AND-wrapping-OR.
    if (
      node.type === 'AND' &&
      children.length === 1 &&
      (children[0].type === 'AND' || children[0].type === 'OR')
    ) {
      return children[0];
    }
    return { ...node, children };
  }
  return node;
}

/**
 * Inject is_outbound = true before submitting to the API.
 *
 * is_outbound=true must be an *unconditional* constraint, i.e. ANDed with the
 * user's conditions. is_outbound is always true on the outbound path, so if it
 * were injected as a sibling of an OR root (a disjunct) the rule would match
 * EVERY outbound mail, ignoring the user's real conditions (review M3). We can
 * only safely prepend when the root is already an AND; for an OR root (or a bare
 * condition) we wrap the whole thing in a new AND.
 */
export function injectIsOutbound(node: RuleNode): RuleNode {
  const stripped = stripIsOutbound(node);
  if (stripped.type === 'AND') {
    return { ...stripped, children: [IS_OUTBOUND_NODE, ...(stripped.children ?? [])] };
  }
  return { type: 'AND', children: [IS_OUTBOUND_NODE, stripped] };
}
