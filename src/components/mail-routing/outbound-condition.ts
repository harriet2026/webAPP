import type { RuleNode } from '@/types/unified-rules';

// Pure condition-tree helpers for the outbound routing tab.

/**
 * Default condition tree for a new rule.
 *
 * It deliberately carries NO direction condition (GT-12321). This tab used to
 * force `is_outbound = true` into every saved rule and to strip whatever
 * is_outbound condition the operator had written, which made a receive-direction
 * rule impossible to express — so inbound mail could never be routed through
 * proxysvr. Direction is now an ordinary condition the operator writes (and
 * therefore also omits) like any other; a rule with no direction condition
 * matches BOTH directions, which the tab's notice text warns about.
 */
export const defaultUserTree = (): RuleNode => ({
  type: 'AND',
  children: [
    { type: 'condition', field: 'senderdomain', operator: 'eq', value: '' },
  ],
});
