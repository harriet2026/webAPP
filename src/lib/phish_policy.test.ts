import { describe, expect, it } from 'vitest';
import actionCases from '../../../internal/models/phishpolicy/testdata/action-cases.json';
import boundaryCases from '../../../internal/models/phishpolicy/testdata/boundary-cases.json';
import type { PhishRiskPolicy } from '@/types/phishing-config';
import { validateRiskPolicy } from './phish_policy';

describe('phishing risk policy shared contract table', () => {
  it.each(actionCases)('$name', (testCase) => {
    const policy = {
      cutoffs: { low: 40, medium: 70, high: 90 },
      policies: Object.fromEntries(['suspicious', 'low', 'medium', 'high'].map((risk, index) => [risk, { base_disposition: testCase.actions[index] }])),
    } as PhishRiskPolicy;
    expect(validateRiskPolicy(policy)).toEqual('error' in testCase ? testCase.error : null);
  });

  it('contains every combination exactly once and 35 valid policies', () => {
    const names = new Set(actionCases.map((row) => row.actions.join('/')));
    expect(names.size).toBe(256);
    expect(actionCases.filter((row) => row.valid)).toHaveLength(35);
    for (const a of ['proceed', 'audit', 'quarantine', 'discard'])
      for (const b of ['proceed', 'audit', 'quarantine', 'discard'])
        for (const c of ['proceed', 'audit', 'quarantine', 'discard'])
          for (const d of ['proceed', 'audit', 'quarantine', 'discard'])
            expect(names.has([a, b, c, d].join('/'))).toBe(true);
  });

  it.each(boundaryCases)('$name', (testCase) => {
    const policy = structuredClone(testCase.policy) as PhishRiskPolicy | null;
    const before = JSON.stringify(policy);
    expect(validateRiskPolicy(policy)).toEqual('error' in testCase ? testCase.error : null);
    expect(JSON.stringify(policy)).toBe(before);
  });
});
