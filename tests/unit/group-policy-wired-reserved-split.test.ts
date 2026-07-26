import { describe, it, expect } from 'vitest';
import { STAGE_POLICIES, findPolicy } from '@/components/security/group-policy/stage-policies';

// Backend (internal/api/group_policy.go wiredGroupPolicyStageKeys): these keys
// have a policyKeyForRule mapping in the engine AND their action rules flow
// through the unified stage loop, whose actionSkipGate consumes the
// group-policy verdict — so a "disable" genuinely suppresses them and the
// backend accepts a non-inherit status at write time.
//
// GT-12274 wired 10 more (rbl / overseas / authSpoofing / recipientCheck /
// attachment / url / intentEngine / phishingAgent / impersonationAgent /
// similarDetection) on top of the original 4.
//
// Every other key must keep reserved=true so the UI stays honest. The five
// still reserved are NOT oversights — their enforcement does not read the
// verdict, so accepting a "disable" would be a silent no-op:
//   ipFrequency / ipFilter : dedicated runtime, skipped by the unified loop
//   userList               : no page→policyKey mapping
//   behaviorControl        : out-of-band OnRcpt path
//   retrospectAgent        : filtered out of the unified rule set (async
//                            post-delivery plan)
const WIRED_BACKEND_KEYS = new Set([
  'senderFilter',
  'content',
  'advancedRules',
  'mailMarking',
  'rbl',
  'overseas',
  'authSpoofing',
  'recipientCheck',
  'attachment',
  'url',
  'intentEngine',
  'phishingAgent',
  'impersonationAgent',
  'similarDetection',
]);

function allPolicyKeys(): string[] {
  const out: string[] = [];
  for (const stage of STAGE_POLICIES) {
    for (const p of stage.policies) out.push(p.key);
  }
  return out;
}

describe('group-policy stage-policies wired/reserved split', () => {
  it('every policy key has a backend counterpart (no UI-only typos)', () => {
    // Mirror of validGroupPolicyStageKeys in internal/api/group_policy.go.
    // If this assertion fires, either the UI added a key the backend does
    // not know about, or this list needs updating in both places.
    const expectedBackendKeys = new Set([
      'ipFrequency', 'ipFilter', 'rbl', 'overseas',
      'senderFilter', 'userList', 'behaviorControl', 'authSpoofing', 'recipientCheck',
      'attachment', 'url', 'content', 'intentEngine',
      'phishingAgent', 'impersonationAgent', 'retrospectAgent',
      'similarDetection', 'advancedRules', 'mailMarking',
    ]);
    const uiKeys = new Set(allPolicyKeys());
    for (const k of expectedBackendKeys) {
      expect(uiKeys.has(k), `UI missing backend key ${k}`).toBe(true);
    }
    for (const k of uiKeys) {
      expect(expectedBackendKeys.has(k), `UI has extra key ${k} not in backend`).toBe(true);
    }
  });

  it('only the wired keys carry reserved=false (everything else is reserved)', () => {
    for (const key of allPolicyKeys()) {
      const def = findPolicy(key);
      if (!def) continue;
      if (WIRED_BACKEND_KEYS.has(key)) {
        expect(def.reserved, `wired key ${key} must NOT be marked reserved`).toBe(false);
      } else {
        expect(def.reserved, `non-wired key ${key} MUST be marked reserved`).toBe(true);
      }
    }
  });
});
