import { describe, it, expect } from 'vitest';
import {
  toUIAction,
  applyUIAction,
  INTENT_UI_ACTIONS,
  type IntentSingleConfig,
} from '@/types/intent-engine';

function singleConfig(cfg: Omit<IntentSingleConfig, 'detection_mode'> & Partial<Pick<IntentSingleConfig, 'detection_mode'>>): IntentSingleConfig {
  return { detection_mode: 'classification', ...cfg };
}

describe('INTENT_UI_ACTIONS', () => {
  it('uses the canonical five-action contract', () => {
    expect(INTENT_UI_ACTIONS).toEqual(['accept', 'proceed', 'quarantine', 'audit', 'discard']);
  });
});

describe('toUIAction', () => {
  it('exposes proceed without an alias', () => {
    const cfg = singleConfig({ enabled: true, action: 'proceed' });
    expect(toUIAction(cfg)).toBe('proceed');
  });

  it('keeps proceed with mark_config unchanged', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'proceed',
      mark_config: { subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' } },
    });
    expect(toUIAction(cfg)).toBe('proceed');
  });

  it('passes through terminal actions', () => {
    for (const a of ['accept', 'quarantine', 'audit', 'discard'] as const) {
      expect(toUIAction(singleConfig({ enabled: true, action: a }))).toBe(a);
    }
  });

  it('allows an empty proceed mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'proceed',
      mark_config: {},
    });
    expect(toUIAction(cfg)).toBe('proceed');
  });
});

describe('applyUIAction', () => {
  it('proceed preserves existing mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'proceed',
      mark_config: { subject_mark: { enabled: true, text: '[X]', position: 'prefix' } },
    });
    const next = applyUIAction(cfg, 'proceed', 'subscription');
    expect(next.action).toBe('proceed');
    expect(next.mark_config).toEqual({
      subject_mark: { enabled: true, text: '[X]', position: 'prefix' },
    });
  });

  it('proceed auto-creates the canonical default mark_config', () => {
    const cfg = singleConfig({ enabled: true, action: 'proceed' });
    const next = applyUIAction(cfg, 'proceed', 'subscription');
    expect(next.action).toBe('proceed');
    expect(next.mark_config).toEqual({
      subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' },
      header_mark: { enabled: false, name: 'X-OSG-Intent', value: '[订阅]' },
    });
  });

  it('switching to a terminal action strips mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'proceed',
      mark_config: { subject_mark: { enabled: true, text: '[X]', position: 'prefix' } },
    });
    for (const a of ['accept', 'quarantine', 'audit', 'discard'] as const) {
      const next = applyUIAction(cfg, a, 'subscription');
      expect(next.action).toBe(a);
      expect(next.mark_config).toBeUndefined();
    }
  });

  it('preserves enabled flag', () => {
    const cfg = singleConfig({ enabled: false, action: 'quarantine' });
    expect(applyUIAction(cfg, 'proceed', 'subscription').enabled).toBe(false);
    expect(applyUIAction(cfg, 'discard', 'subscription').enabled).toBe(false);
  });

  it('round-trip: applyUIAction then toUIAction is identity', () => {
    const start = singleConfig({ enabled: true, action: 'quarantine' });
    for (const ui of ['accept', 'proceed', 'quarantine', 'audit', 'discard'] as const) {
      const after = applyUIAction(start, ui, 'subscription');
      expect(toUIAction(after)).toBe(ui);
    }
  });
});
