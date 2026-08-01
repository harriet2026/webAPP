import type { Template, ProtocolChecksConfig, AuthSpoofingAction, CheckItem } from '@/types/auth-spoofing';

type TemplateActions = {
  spf:   Record<string, AuthSpoofingAction>;
  dkim:  Record<string, AuthSpoofingAction>;
  dmarc: Record<string, AuthSpoofingAction>;
  ptr:   Record<string, AuthSpoofingAction>;
};

export const TEMPLATES: Record<'loose'|'standard'|'strict', TemplateActions> = {
  loose: {
    spf:  { fail:'quarantine', softfail:'audit', none:'accept', temperror:'accept' },
    dkim: { fail:'quarantine', neutral:'audit', partial:'accept', none:'accept' },
    dmarc:{ reject:'quarantine', quarantine:'audit', none:'audit' },
    ptr:  { noptr:'accept', nomatch:'audit', ehlo_mismatch:'audit' },
  },
  standard: {
    spf:  { fail:'reject', softfail:'quarantine', none:'audit', temperror:'audit' },
    dkim: { fail:'quarantine', neutral:'quarantine', partial:'accept', none:'audit' },
    dmarc:{ reject:'reject', quarantine:'quarantine', none:'audit' },
    ptr:  { noptr:'audit', nomatch:'quarantine', ehlo_mismatch:'quarantine' },
  },
  strict: {
    spf:  { fail:'reject', softfail:'quarantine', none:'quarantine', temperror:'quarantine' },
    dkim: { fail:'reject', neutral:'quarantine', partial:'quarantine', none:'quarantine' },
    dmarc:{ reject:'reject', quarantine:'quarantine', none:'quarantine' },
    ptr:  { noptr:'quarantine', nomatch:'reject', ehlo_mismatch:'reject' },
  },
};

function applyGroup(
  current: Record<string, CheckItem>,
  actions: Record<string, AuthSpoofingAction>,
): Record<string, CheckItem> {
  const out: Record<string, CheckItem> = {};
  for (const k of Object.keys(current)) {
    const action = actions[k] ?? current[k].action;
    out[k] = { ...current[k], action, enabled: action !== 'accept' };
  }
  return out;
}

export function applyTemplate(p: ProtocolChecksConfig, name: 'loose'|'standard'|'strict'): ProtocolChecksConfig {
  const t = TEMPLATES[name];
  return {
    ...p,
    template: name,
    spf:   applyGroup(p.spf,   t.spf),
    dkim:  applyGroup(p.dkim,  t.dkim),
    dmarc: applyGroup(p.dmarc, t.dmarc),
    ptr:   applyGroup(p.ptr,   t.ptr),
  };
}

export function inferTemplate(p: ProtocolChecksConfig): Template {
  for (const [name, t] of Object.entries(TEMPLATES) as [string, TemplateActions][]) {
    if (matchesGroup(p.spf, t.spf) && matchesGroup(p.dkim, t.dkim) && matchesGroup(p.dmarc, t.dmarc) && matchesGroup(p.ptr, t.ptr)) {
      return name as Template;
    }
  }
  return 'custom';
}

function matchesGroup(actual: Record<string, CheckItem>, expected: Record<string, AuthSpoofingAction>): boolean {
  const allKeys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const k of allKeys) {
    const item = actual[k];
    if (!item) continue;
    const wantAction = expected[k] ?? '';
    const effectiveAction = item.enabled ? (item.action ?? '') : 'accept';
    if (effectiveAction !== wantAction) return false;
  }
  return true;
}
