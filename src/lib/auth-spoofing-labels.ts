import type { AuthSpoofingAction } from '@/types/auth-spoofing';

// i18n message keys cannot contain hyphens (next-intl treats `.` as the only
// nesting separator, but a literal `-` inside a segment breaks key lookup and
// falls back to showing the raw key string). Storage values like
// 'mark-delivery' must stay hyphenated, so we camelCase only when building the
// message key, e.g. 'mark-delivery' -> 'markDelivery'.
export const toMessageKeySegment = (a: AuthSpoofingAction): string =>
  a.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// Keys are RELATIVE to the `authSpoofing` i18n namespace — consumers must
// resolve them with `useTranslations('authSpoofing')` (NOT the root translator,
// which would double-prefix to `authSpoofing.authSpoofing.*`).
export const formatActionKey = (a: AuthSpoofingAction) => `formatActionLabel.${toMessageKeySegment(a)}`;
export const protocolActionKey = (a: AuthSpoofingAction) => `protocolActionLabel.${toMessageKeySegment(a)}`;
export const protocolActionShortKey = (a: AuthSpoofingAction) => `protocolActionShort.${toMessageKeySegment(a)}`;
export const protocolActionDescKey = (a: AuthSpoofingAction) => `protocolActionDesc.${toMessageKeySegment(a)}`;

export function flowSubKey(a: AuthSpoofingAction, isPtr: boolean): string {
  if (a === 'discard') return 'flowSub.drop';
  if (isPtr) return 'flowSub.check';
  if (a === 'reject') return 'flowSub.block';
  if (a === 'quarantine') return 'flowSub.quarantine';
  if (a === 'audit') return 'flowSub.review';
  if (a === 'mark-delivery') return 'flowSub.tag';
  return 'flowSub.pass';
}

/** Severity order for computing the dominant action across a group of rules. */
const ACTION_SEVERITY: Record<AuthSpoofingAction, number> = {
  discard: 5,
  reject: 4,
  audit: 3.5,
  quarantine: 3,
  'mark-delivery': 2,
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
