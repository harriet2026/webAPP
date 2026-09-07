import { describe, expect, it } from 'vitest';

import {
  buildPolicyConfigRoute,
  parsePipelineDeepLink,
  parseRuleDatabaseID,
} from './policy-deep-link';

describe('policy configuration deep links (GT-12583)', () => {
  it('routes content-rule evidence to the content module with the public rule ID', () => {
    expect(buildPolicyConfigRoute('CR', 'CR-26694')).toBe(
      '/security/pipeline?module=content&rule_id=CR-26694',
    );
  });

  it.each([
    ['IPFREQ', 'ipFrequency'],
    ['IPBL', 'ipFilter'],
    ['RBL', 'rbl'],
    ['OVERSEAS', 'overseas'],
    ['SBL', 'senderFilter'],
    ['AUTH', 'authSpoofing'],
    ['BEHAVIOR', 'behaviorControl'],
    ['RCPT', 'recipientCheck'],
    ['UBL', 'userList'],
    ['ATT-AV', 'attachment'],
    ['URL', 'url'],
    ['INTENT', 'intentEngine'],
    ['SIM', 'similarDetection'],
    ['ACF', 'advancedRules'],
    ['MAIL-MARK', 'mailMarking'],
  ])('routes %s evidence to its pipeline module', (policyKey, module) => {
    expect(buildPolicyConfigRoute(policyKey, `${policyKey}-7`)).toContain(
      `module=${module}`,
    );
  });

  it('routes AI evidence to the corresponding agent configuration', () => {
    expect(buildPolicyConfigRoute('AI-SPOOF', 'AI-SPOOF-012')).toBe(
      '/agent-center/overview?agent=spoofing&tab=sender-name&rule_id=AI-SPOOF-012',
    );
  });

  it('parses a valid pipeline target and numeric database ID', () => {
    const params = new URLSearchParams('module=content&rule_id=CR-26694');
    expect(parsePipelineDeepLink(params)).toEqual({
      stage: 3,
      key: 'content',
      ruleRef: 'CR-26694',
      ruleDatabaseID: 26694,
    });
  });

  it('rejects unknown module names and does not invent database IDs', () => {
    expect(parsePipelineDeepLink(new URLSearchParams('module=unknown&rule_id=CR-1'))).toBeUndefined();
    expect(parseRuleDatabaseID('AI-TRACE:run-20260821')).toBeUndefined();
  });
});
