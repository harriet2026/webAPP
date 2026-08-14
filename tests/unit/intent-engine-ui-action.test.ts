import { describe, it, expect } from 'vitest';
import {
  toUIAction,
  applyUIAction,
  RECEIVE_UI_ACTIONS,
  type IntentSingleConfig,
} from '@/types/intent-engine';

function singleConfig(cfg: Omit<IntentSingleConfig, 'detection_mode'> & Partial<Pick<IntentSingleConfig, 'detection_mode'>>): IntentSingleConfig {
  return { detection_mode: 'classification', ...cfg };
}

describe('RECEIVE_UI_ACTIONS (GT-11746, GT-12965 已去掉阻断)', () => {
  it('has exactly 4 actions (no deliver, no reject)', () => {
    expect(RECEIVE_UI_ACTIONS).toHaveLength(4);
    expect(RECEIVE_UI_ACTIONS).not.toContain('deliver');
    expect(RECEIVE_UI_ACTIONS).not.toContain('reject');
  });
});

describe('toUIAction', () => {
  it('maps accept without mark_config to proceed', () => {
    const cfg = singleConfig({ enabled: true, action: 'accept' });
    expect(toUIAction(cfg)).toBe('proceed');
  });

  it('maps accept with mark_config to proceed', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' } },
    });
    expect(toUIAction(cfg)).toBe('proceed');
  });

  it('passes through non-accept actions', () => {
    for (const a of ['quarantine', 'audit', 'discard'] as const) {
      expect(toUIAction(singleConfig({ enabled: true, action: a }))).toBe(a);
    }
  });

  it('treats empty mark_config object as proceed (truthy)', () => {
    // Defensive: an explicitly-empty mark_config still indicates intent to mark.
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: {},
    });
    expect(toUIAction(cfg)).toBe('proceed');
  });
});

describe('applyUIAction', () => {
  it('proceed preserves existing mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { subject_mark: { enabled: true, text: '[X]', position: 'prefix' } },
    });
    const next = applyUIAction(cfg, 'proceed', 'subscription');
    expect(next.action).toBe('accept');
    expect(next.mark_config).toEqual({
      subject_mark: { enabled: true, text: '[X]', position: 'prefix' },
    });
  });

  it('proceed auto-creates default mark_config when missing', () => {
    const cfg = singleConfig({ enabled: true, action: 'accept' });
    const next = applyUIAction(cfg, 'proceed', 'subscription');
    expect(next.action).toBe('accept');
    expect(next.mark_config).toEqual({
      subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' },
      header_mark: { enabled: false, text: '[订阅]', position: 'prefix' },
    });
  });

  it('switching to non-accept strips mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { subject_mark: { enabled: true, text: '[X]', position: 'prefix' } },
    });
    for (const a of ['quarantine', 'audit', 'discard'] as const) {
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
    for (const ui of ['proceed', 'quarantine', 'audit', 'discard'] as const) {
      const after = applyUIAction(start, ui, 'subscription');
      expect(toUIAction(after)).toBe(ui);
    }
  });
});
