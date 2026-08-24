import { describe, expect, it } from 'vitest';
import { INTENT_ACTIONS, applyUIAction, thresholdActionsForDirection, type IntentSingleConfig } from '@/types/intent-engine';

const base: IntentSingleConfig = {
  enabled: true,
  action: 'proceed',
  detection_mode: 'classification',
  mark_config: {
    subject_mark: { enabled: true, text: '[订阅]', position: 'prefix' }
  }
};

describe('intent engine action contract', () => {
  it('keeps delivery accept distinct from non-terminal proceed', () => {
    expect(INTENT_ACTIONS).toEqual(['accept', 'proceed', 'quarantine', 'audit', 'discard']);
    const deliver = applyUIAction(base, 'accept', 'subscription');
    expect(deliver.action).toBe('accept');
    expect(deliver.mark_config).toBeUndefined();
  });

  it('offers accept and proceed in every threshold direction', () => {
    for (const direction of ['receive', 'send', 'internal'] as const) {
      expect(thresholdActionsForDirection(direction)).toContain('accept');
      expect(thresholdActionsForDirection(direction)).toContain('proceed');
    }
  });
});
