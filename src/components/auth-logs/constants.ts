import type { IPLocationInfo } from '@/lib/api/auth-attempts';

export const PROTOCOLS = ['SMTP', 'LDAP', 'POP3', 'IMAP'] as const;
export type AuthProtocol = typeof PROTOCOLS[number];

export const SCENES = ['userspace', 'smtpsend', 'mailsync'] as const;
export type AuthScene = typeof SCENES[number];

export const FAIL_REASONS = ['wrongPassword', 'userNotExist', 'accountLocked', 'serverTimeout', 'connectionRefused', 'certError', 'protocolMismatch', 'unknown'] as const;
export type FailReason = typeof FAIL_REASONS[number];

export const PROTOCOL_OPTIONS: { value: AuthProtocol; labelKey: string }[] = [
  { value: 'SMTP', labelKey: 'authAttempts.protocols.SMTP' },
  { value: 'LDAP', labelKey: 'authAttempts.protocols.LDAP' },
  { value: 'POP3', labelKey: 'authAttempts.protocols.POP3' },
  { value: 'IMAP', labelKey: 'authAttempts.protocols.IMAP' },
];

// Filter options expose only scenes that auth_attempt_log actually contains.
// authd (the sole writer) records every SMTP-AUTH attempt as 'smtpsend';
// 'userspace'/'mailsync' are not produced yet, so offering them as filters would
// always return zero rows (a dead filter). They remain in SCENES/SCENE_LABEL_KEY
// for column/detail rendering should such rows ever appear.
export const SCENE_OPTIONS: { value: AuthScene; labelKey: string }[] = [
  { value: 'smtpsend', labelKey: 'authAttempts.scenes.smtpsend' },
];

const SCENE_LABEL_KEY: Record<AuthScene, string> = {
  userspace: 'authAttempts.scenes.userspace',
  smtpsend: 'authAttempts.scenes.smtpsend',
  mailsync: 'authAttempts.scenes.mailsync',
};

// PROTOCOL_LABEL_KEY covers all five historical protocol codes for column/detail
// rendering, including LOCAL — even though PROTOCOL_OPTIONS (the filter) only
// exposes the four still-producible protocols now that the local account backend
// is disabled by default. Historical LOCAL rows must still localize (spec §4.1).
const PROTOCOL_LABEL_KEY: Record<string, string> = {
  SMTP: 'authAttempts.protocols.SMTP',
  LDAP: 'authAttempts.protocols.LDAP',
  POP3: 'authAttempts.protocols.POP3',
  IMAP: 'authAttempts.protocols.IMAP',
  LOCAL: 'authAttempts.protocols.LOCAL',
};

export const FAIL_REASON_OPTIONS: { value: FailReason; labelKey: string }[] = [
  { value: 'wrongPassword', labelKey: 'authAttempts.failReasons.wrongPassword' },
  { value: 'userNotExist', labelKey: 'authAttempts.failReasons.userNotExist' },
  { value: 'accountLocked', labelKey: 'authAttempts.failReasons.accountLocked' },
  { value: 'serverTimeout', labelKey: 'authAttempts.failReasons.serverTimeout' },
  { value: 'connectionRefused', labelKey: 'authAttempts.failReasons.connectionRefused' },
  { value: 'certError', labelKey: 'authAttempts.failReasons.certError' },
  { value: 'protocolMismatch', labelKey: 'authAttempts.failReasons.protocolMismatch' },
  { value: 'unknown', labelKey: 'authAttempts.failReasons.unknown' },
];

export const FAIL_ADVICE_KEY: Record<string, string> = {
  wrongPassword: 'authAttempts.failAdvice.wrongPassword',
  userNotExist: 'authAttempts.failAdvice.userNotExist',
  accountLocked: 'authAttempts.failAdvice.accountLocked',
  serverTimeout: 'authAttempts.failAdvice.serverTimeout',
  connectionRefused: 'authAttempts.failAdvice.connectionRefused',
  certError: 'authAttempts.failAdvice.certError',
  protocolMismatch: 'authAttempts.failAdvice.protocolMismatch',
  unknown: 'authAttempts.failAdvice.unknown',
};

export function failReasonLabelKey(code?: string): string | undefined {
  if (!code) return undefined;
  const match = FAIL_REASON_OPTIONS.find((opt) => opt.value === code);
  return match?.labelKey;
}

export function protocolLabelKey(code?: string): string | undefined {
  if (!code) return undefined;
  return PROTOCOL_LABEL_KEY[code];
}

export function sceneLabelKey(code?: string): string | undefined {
  if (!code) return undefined;
  return SCENE_LABEL_KEY[code as AuthScene];
}

// formatIPLocation localizes the language-neutral ip_location descriptor: the
// `kind` is translated and `region` (a country name) is appended verbatim
// (spec §11). Returns '' when there is nothing to show.
export function formatIPLocation(
  loc: IPLocationInfo | null | undefined,
  t: (key: string) => string,
): string {
  if (!loc) return '';
  if (loc.kind === 'internal') return t('authAttempts.ipLocation.internal');
  if (loc.kind === 'domestic' || loc.kind === 'overseas') {
    const prefix = t(`authAttempts.ipLocation.${loc.kind}`);
    return loc.region ? `${prefix} · ${loc.region}` : prefix;
  }
  return '';
}
