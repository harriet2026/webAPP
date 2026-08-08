import type { Template, ProtocolChecksConfig, AuthSpoofingAction, CheckItem } from '@/types/auth-spoofing';

type TemplateActions = {
  spf:   Record<string, AuthSpoofingAction>;
  dkim:  Record<string, AuthSpoofingAction>;
  dmarc: Record<string, AuthSpoofingAction>;
  ptr:   Record<string, AuthSpoofingAction>;
};

export const TEMPLATES: Record<'loose'|'standard'|'strict', TemplateActions> = {
  loose: {
    spf:  { fail:'quarantine', softfail:'mark-delivery', none:'accept', temperror:'accept' },
    dkim: { fail:'quarantine', neutral:'mark-delivery', partial:'accept', none:'accept' },
    dmarc:{ reject:'quarantine', quarantine:'mark-delivery', none:'mark-delivery', no_record:'mark-delivery', query_fail:'mark-delivery' },
    ptr:  { noptr:'accept', nomatch:'mark-delivery', ehlo_mismatch:'mark-delivery' },
  },
  standard: {
    spf:  { fail:'reject', softfail:'quarantine', none:'mark-delivery', temperror:'mark-delivery' },
    dkim: { fail:'quarantine', neutral:'quarantine', partial:'accept', none:'mark-delivery' },
    dmarc:{ reject:'reject', quarantine:'quarantine', none:'mark-delivery', no_record:'quarantine', query_fail:'mark-delivery' },
    ptr:  { noptr:'mark-delivery', nomatch:'quarantine', ehlo_mismatch:'quarantine' },
  },
  strict: {
    spf:  { fail:'reject', softfail:'quarantine', none:'quarantine', temperror:'quarantine' },
    dkim: { fail:'reject', neutral:'quarantine', partial:'quarantine', none:'quarantine' },
    dmarc:{ reject:'reject', quarantine:'quarantine', none:'quarantine', no_record:'quarantine', query_fail:'quarantine' },
    ptr:  { noptr:'quarantine', nomatch:'reject', ehlo_mismatch:'reject' },
  },
};

function applyGroup(
  current: Record<string, CheckItem>,
  actions: Record<string, AuthSpoofingAction>,
): Record<string, CheckItem> {
  const out: Record<string, CheckItem> = {};
  // Process keys that exist in current config, applying template action if defined
  for (const k of Object.keys(current)) {
    const action = actions[k] ?? current[k].action;
    out[k] = { ...current[k], action, enabled: action !== 'accept' };
  }
  // Also add keys that exist in the template but not yet in current config (e.g. newly added scenarios)
  for (const k of Object.keys(actions)) {
    if (!(k in out)) {
      const action = actions[k];
      out[k] = { enabled: action !== 'accept', action, observe_mode: false };
    }
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
