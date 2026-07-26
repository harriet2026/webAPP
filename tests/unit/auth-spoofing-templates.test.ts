import { describe, it, expect } from 'vitest';
import { TEMPLATES, applyTemplate, inferTemplate } from '@/lib/auth-spoofing-templates';
import type { ProtocolChecksConfig } from '@/types/auth-spoofing';

function makeFromTemplate(name: 'loose' | 'standard' | 'strict'): ProtocolChecksConfig {
  const t = TEMPLATES[name];
  const toItem = (a: string) => ({ enabled: a !== 'accept', action: a as import('@/types/auth-spoofing').AuthSpoofingAction, observe_mode: false });
  return {
    template: name,
    observe_mode: false,
    spf:   Object.fromEntries(Object.entries(t.spf).map(([k, a]) => [k, toItem(a)])) as Record<string, import('@/types/auth-spoofing').CheckItem>,
    dkim:  Object.fromEntries(Object.entries(t.dkim).map(([k, a]) => [k, toItem(a)])) as Record<string, import('@/types/auth-spoofing').CheckItem>,
    dmarc: Object.fromEntries(Object.entries(t.dmarc).map(([k, a]) => [k, toItem(a)])) as Record<string, import('@/types/auth-spoofing').CheckItem>,
    ptr:   Object.fromEntries(Object.entries(t.ptr).map(([k, a]) => [k, toItem(a)])) as Record<string, import('@/types/auth-spoofing').CheckItem>,
  };
}

const baseStandard = makeFromTemplate('standard');

describe('inferTemplate', () => {
  it('returns standard for standard config', () => {
    expect(inferTemplate(baseStandard)).toBe('standard');
  });

  it('returns loose for loose config', () => {
    expect(inferTemplate(makeFromTemplate('loose'))).toBe('loose');
  });

  it('returns strict for strict config', () => {
    expect(inferTemplate(makeFromTemplate('strict'))).toBe('strict');
  });

  it('returns custom after a single change', () => {
    const c = {
      ...baseStandard,
      spf: { ...baseStandard.spf, fail: { ...baseStandard.spf.fail, action: 'discard' as const } },
    };
    expect(inferTemplate(c)).toBe('custom');
  });

  it('returns standard when observe_mode differs but actions match', () => {
    const c = {
      ...baseStandard,
      spf: { ...baseStandard.spf, fail: { ...baseStandard.spf.fail, observe_mode: true } },
    };
    expect(inferTemplate(c)).toBe('standard');
  });

  it('ignores observe_mode changes across all groups', () => {
    const c = {
      ...baseStandard,
      spf:   { ...baseStandard.spf,   fail: { ...baseStandard.spf.fail,   observe_mode: true } },
      dkim:  { ...baseStandard.dkim,  fail: { ...baseStandard.dkim.fail,  observe_mode: true } },
      dmarc: { ...baseStandard.dmarc, reject: { ...baseStandard.dmarc.reject, observe_mode: true } },
      ptr:   { ...baseStandard.ptr,   norecord: { ...baseStandard.ptr.norecord, observe_mode: true } },
    };
    expect(inferTemplate(c)).toBe('standard');
  });

  it('detects action changes in dkim group', () => {
    const c = {
      ...baseStandard,
      dkim: { ...baseStandard.dkim, fail: { ...baseStandard.dkim.fail, action: 'reject' as const } },
    };
    expect(inferTemplate(c)).toBe('custom');
  });

  it('detects action changes in ptr group', () => {
    const c = {
      ...baseStandard,
      ptr: { ...baseStandard.ptr, norecord: { ...baseStandard.ptr.norecord, enabled: true, action: 'reject' as const } },
    };
    expect(inferTemplate(c)).toBe('custom');
  });

  it('detects action changes in dmarc group', () => {
    const c = {
      ...baseStandard,
      dmarc: { ...baseStandard.dmarc, quarantine: { ...baseStandard.dmarc.quarantine, action: 'reject' as const } },
    };
    expect(inferTemplate(c)).toBe('custom');
  });
});

describe('applyTemplate', () => {
  it('transforms standard to strict', () => {
    const r = applyTemplate(baseStandard, 'strict');
    expect(r.template).toBe('strict');
    expect(r.spf.fail.action).toBe('reject');
    expect(r.dkim.fail.action).toBe('reject');
    expect(r.dmarc.reject.action).toBe('reject');
    expect(r.ptr.norecord.action).toBe('quarantine');
  });

  it('transforms strict to loose', () => {
    const strict = makeFromTemplate('strict');
    const r = applyTemplate(strict, 'loose');
    expect(r.template).toBe('loose');
    expect(r.spf.fail.action).toBe('quarantine');
    expect(r.dkim.fail.action).toBe('quarantine');
    expect(r.spf.none.action).toBe('accept');
  });

  it('sets enabled=false for accept actions from template', () => {
    const r = applyTemplate(baseStandard, 'loose');
    expect(r.spf.none.action).toBe('accept');
    expect(r.spf.none.enabled).toBe(false);
    expect(r.dkim.partial.action).toBe('accept');
    expect(r.dkim.partial.enabled).toBe(false);
  });

  it('preserves observe_mode flags', () => {
    const custom = {
      ...baseStandard,
      spf: { ...baseStandard.spf, fail: { enabled: true, action: 'quarantine' as const, observe_mode: true } },
    };
    const r = applyTemplate(custom, 'strict');
    expect(r.spf.fail.observe_mode).toBe(true);
    expect(r.spf.fail.action).toBe('reject');
    expect(r.spf.fail.enabled).toBe(true);
  });

  it('round-trips: apply then infer', () => {
    const r = applyTemplate(baseStandard, 'strict');
    expect(inferTemplate(r)).toBe('strict');
  });
});

describe('TEMPLATES structure', () => {
  it('PTR keys use norecord/temperror/ehlomismatch/amismatch not pass or match', () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(Object.keys(t.ptr)).not.toContain('pass');
      expect(Object.keys(t.ptr)).not.toContain('match');
      expect(Object.keys(t.ptr)).toContain('norecord');
      expect(Object.keys(t.ptr)).toContain('temperror');
      expect(Object.keys(t.ptr)).toContain('ehlomismatch');
      expect(Object.keys(t.ptr)).toContain('amismatch');
    }
  });

  it('DMARC keys use reject/quarantine/none (no accept option, no legacy "fail")', () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(Object.keys(t.dmarc)).not.toContain('fail');
      expect(Object.keys(t.dmarc)).toContain('reject');
      expect(Object.keys(t.dmarc)).toContain('quarantine');
      expect(Object.keys(t.dmarc)).toContain('none');
    }
  });
});
