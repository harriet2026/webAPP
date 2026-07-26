import { describe, it, expect } from 'vitest';
import { genericAgentTypes } from '../investigation-types';

describe('genericAgentTypes', () => {
  it('excludes threat_traceback (threat-retro only)', () => {
    const values = genericAgentTypes.map((t) => t.value);
    expect(values).toContain('phish_analysis');
    expect(values).toContain('account_anomaly_analysis');
    expect(values).toContain('rule_analysis');
    expect(values).not.toContain('threat_traceback');
  });
});
