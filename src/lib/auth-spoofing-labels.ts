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
  return 'flowSub.quarantine';
}
