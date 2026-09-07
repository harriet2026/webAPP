/** Canonical wire values shared by security-policy UIs and product APIs. */
export type PolicyAction =
  | 'accept'
  | 'proceed'
  | 'observe'
  | 'quarantine'
  | 'audit'
  | 'reject'
  | 'discard';

export type TerminalPolicyAction = Exclude<PolicyAction, 'proceed' | 'observe'>;

export const POLICY_ACTIONS: readonly PolicyAction[] = [
  'accept',
  'proceed',
  'observe',
  'quarantine',
  'audit',
  'reject',
  'discard',
] as const;
