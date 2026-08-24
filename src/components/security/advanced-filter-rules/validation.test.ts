import { describe, expect, it } from 'vitest';
import { canSaveActions } from './validation';

describe('canSaveActions', () => {
  it('accepts every canonical primary action without requiring an addon', () => {
    for (const action of ['accept', 'proceed', 'quarantine', 'audit', 'discard'] as const) {
      expect(canSaveActions(action, {})).toBe(true);
    }
  });

  it('proceed remains valid when optional addons are enabled', () => {
    expect(canSaveActions('proceed', {
      adminNotify: { enabled: true, params: {} },
    })).toBe(true);
  });
});
