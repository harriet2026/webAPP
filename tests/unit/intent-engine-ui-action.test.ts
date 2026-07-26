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

describe('RECEIVE_UI_ACTIONS (GT-11746)', () => {
  it('has exactly 5 actions (no deliver)', () => {
    expect(RECEIVE_UI_ACTIONS).toHaveLength(5);
    expect(RECEIVE_UI_ACTIONS).not.toContain('deliver');
  });
});

describe('toUIAction', () => {
  it('maps accept without mark_config to mark_deliver', () => {
    const cfg = singleConfig({ enabled: true, action: 'accept' });
    expect(toUIAction(cfg)).toBe('mark_deliver');
  });

  it('maps accept with mark_config to mark_deliver', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { delivery_target: 'inbox', subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' } },
    });
    expect(toUIAction(cfg)).toBe('mark_deliver');
  });

  it('passes through non-accept actions', () => {
    for (const a of ['quarantine', 'audit', 'reject', 'discard'] as const) {
      expect(toUIAction(singleConfig({ enabled: true, action: a }))).toBe(a);
    }
  });

  it('treats empty mark_config object as mark_deliver (truthy)', () => {
    // Defensive: an explicitly-empty mark_config still indicates intent to mark.
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { delivery_target: 'inbox' },
    });
    expect(toUIAction(cfg)).toBe('mark_deliver');
  });
});

describe('applyUIAction', () => {
  it('mark_deliver preserves existing mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { delivery_target: 'spam_folder', subject_mark: { enabled: true, text: '[X]', position: 'prefix' } },
    });
    const next = applyUIAction(cfg, 'mark_deliver', 'subscription');
    expect(next.action).toBe('accept');
    expect(next.mark_config).toEqual({
      delivery_target: 'spam_folder',
      subject_mark: { enabled: true, text: '[X]', position: 'prefix' },
    });
  });

  it('mark_deliver auto-creates default mark_config when missing', () => {
    const cfg = singleConfig({ enabled: true, action: 'accept' });
    const next = applyUIAction(cfg, 'mark_deliver', 'subscription');
    expect(next.action).toBe('accept');
    expect(next.mark_config).toEqual({
      delivery_target: 'spam_folder',
      subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' },
      body_mark: { enabled: false, text: '[订阅]', position: 'prefix' },
    });
  });

  it('switching to non-accept strips mark_config', () => {
    const cfg = singleConfig({
      enabled: true,
      action: 'accept',
      mark_config: { delivery_target: 'inbox', subject_mark: { enabled: true, text: '[X]', position: 'prefix' } },
    });
    for (const a of ['quarantine', 'audit', 'reject', 'discard'] as const) {
      const next = applyUIAction(cfg, a, 'subscription');
      expect(next.action).toBe(a);
      expect(next.mark_config).toBeUndefined();
    }
  });

  it('preserves enabled flag', () => {
    const cfg = singleConfig({ enabled: false, action: 'quarantine' });
    expect(applyUIAction(cfg, 'mark_deliver', 'subscription').enabled).toBe(false);
    expect(applyUIAction(cfg, 'reject', 'subscription').enabled).toBe(false);
  });

  it('round-trip: applyUIAction then toUIAction is identity', () => {
    const start = singleConfig({ enabled: true, action: 'quarantine' });
    for (const ui of ['mark_deliver', 'quarantine', 'audit', 'reject', 'discard'] as const) {
      const after = applyUIAction(start, ui, 'subscription');
      expect(toUIAction(after)).toBe(ui);
    }
  });
});
