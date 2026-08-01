import type { AuthSpoofingAction } from '@/types/auth-spoofing';

// Keys are RELATIVE to the `authSpoofing` i18n namespace — consumers must
// resolve them with `useTranslations('authSpoofing')` (NOT the root translator,
// which would double-prefix to `authSpoofing.authSpoofing.*`).
export const formatActionKey = (a: AuthSpoofingAction) => `formatActionLabel.${a}`;
export const protocolActionKey = (a: AuthSpoofingAction) => `protocolActionLabel.${a}`;

export function flowSubKey(a: AuthSpoofingAction, isPtr: boolean): string {
  if (a === 'discard') return 'flowSub.drop';
  if (isPtr) return 'flowSub.check';
  if (a === 'reject') return 'flowSub.block';
  if (a === 'quarantine') return 'flowSub.quarantine';
  if (a === 'audit') return 'flowSub.tag';
  return 'flowSub.pass';
}

/** Severity order for computing the dominant action across a group of rules. */
const ACTION_SEVERITY: Record<AuthSpoofingAction, number> = {
  discard: 5,
  reject: 4,
  quarantine: 3,
  audit: 2,
  accept: 1,
};

/**
 * Returns the most severe action among all CheckItem values in a protocol group.
 * Used to drive the flow-diagram node badge so it reflects the actual worst-case
 * outcome rather than a single hard-coded sub-key.
 */
export function dominantAction(
  group: Record<string, { action: AuthSpoofingAction }> | undefined,
  fallback: AuthSpoofingAction = 'accept',
): AuthSpoofingAction {
  if (!group) return fallback;
  const actions = Object.values(group).map((item) => item.action);
  if (actions.length === 0) return fallback;
  return actions.reduce((worst, cur) =>
    (ACTION_SEVERITY[cur] ?? 0) > (ACTION_SEVERITY[worst] ?? 0) ? cur : worst,
  );
}
