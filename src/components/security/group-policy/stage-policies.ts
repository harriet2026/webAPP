export interface PolicyDef {
  key: string;
  nameKey: string;
  descKey: string;
  isGlobalForced: boolean;
  hasParams: boolean;
  hasSubPolicies: boolean;
  isHighRisk: boolean;
  reserved: boolean;
  globalDefaultKey?: string;
}

export interface StageDef {
  key: string;
  nameKey: string;
  requiresAI: boolean;
  policies: PolicyDef[];
}

export const STAGE_POLICIES: StageDef[] = [
  {
    key: 'stage1',
    nameKey: 'groupPolicy.stages.stage1',
    requiresAI: false,
    policies: [
      {
        key: 'ipFrequency',
        nameKey: 'groupPolicy.policies.ipFrequency',
        descKey: 'groupPolicy.policyDesc.ipFrequency',
        isGlobalForced: true,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: true,
        globalDefaultKey: 'groupPolicy.globalDefaults.ipFrequency',
      },
      {
        key: 'ipFilter',
        nameKey: 'groupPolicy.policies.ipFilter',
        descKey: 'groupPolicy.policyDesc.ipFilter',
        isGlobalForced: true,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        // M4: ipFilter has no unified-rules page (CIDR matching uses a
        // separate mechanism), so policyKeyForRule cannot map any rule to
        // the ipFilter verdict — disable would never take effect. Marked
        // reserved (UI "coming soon") to align with the engine; will be
        // flipped to wired once an ip_filter page lands (spec §2.5).
        reserved: true,
        globalDefaultKey: 'groupPolicy.globalDefaults.ipFilter',
      },
      {
        key: 'rbl',
        nameKey: 'groupPolicy.policies.rbl',
        descKey: 'groupPolicy.policyDesc.rbl',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.rbl',
      },
      {
        key: 'overseas',
        nameKey: 'groupPolicy.policies.overseas',
        descKey: 'groupPolicy.policyDesc.overseas',
        isGlobalForced: false,
        hasParams: true,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.overseas',
      },
    ],
  },
  {
    key: 'stage2',
    nameKey: 'groupPolicy.stages.stage2',
    requiresAI: false,
    policies: [
      {
        key: 'senderFilter',
        nameKey: 'groupPolicy.policies.senderFilter',
        descKey: 'groupPolicy.policyDesc.senderFilter',
        isGlobalForced: true,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.senderFilter',
      },
      {
        key: 'userList',
        nameKey: 'groupPolicy.policies.userList',
        descKey: 'groupPolicy.policyDesc.userList',
        isGlobalForced: true,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        // L3: userList has no unified-rules page yet (no page→policyKey
        // mapping exists in policyKeyForRule), so a wired verdict would be
        // silently inert. Marked reserved until the page lands (spec §2.5
        // listed userList as a wired candidate, contingent on this mapping).
        reserved: true,
        globalDefaultKey: 'groupPolicy.globalDefaults.userList',
      },
      {
        key: 'behaviorControl',
        nameKey: 'groupPolicy.policies.behaviorControl',
        descKey: 'groupPolicy.policyDesc.behaviorControl',
        isGlobalForced: true,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        // behavior_control rules are skipped in the unified action loop and
        // enforced out-of-band via behaviorcontrol.Runtime.OnRcpt (milter.go),
        // which never reads group-policy verdicts — so a "disable" here would
        // be a silent no-op. Marked reserved (UI "coming soon") to stay honest,
        // matching the backend wiredGroupPolicyStageKeys set. Flip to wired once
        // OnRcpt consumes the verdict (spec §2.5).
        reserved: true,
        globalDefaultKey: 'groupPolicy.globalDefaults.behaviorControl',
      },
      {
        key: 'authSpoofing',
        nameKey: 'groupPolicy.policies.authSpoofing',
        descKey: 'groupPolicy.policyDesc.authSpoofing',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: true,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.authSpoofing',
      },
      {
        key: 'recipientCheck',
        nameKey: 'groupPolicy.policies.recipientCheck',
        descKey: 'groupPolicy.policyDesc.recipientCheck',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.recipientCheck',
      },
    ],
  },
  {
    key: 'stage3',
    nameKey: 'groupPolicy.stages.stage3',
    requiresAI: false,
    policies: [
      {
        key: 'attachment',
        nameKey: 'groupPolicy.policies.attachment',
        descKey: 'groupPolicy.policyDesc.attachment',
        isGlobalForced: false,
        hasParams: true,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.attachment',
      },
      {
        key: 'url',
        nameKey: 'groupPolicy.policies.url',
        descKey: 'groupPolicy.policyDesc.url',
        isGlobalForced: false,
        hasParams: true,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.url',
      },
      {
        key: 'content',
        nameKey: 'groupPolicy.policies.content',
        descKey: 'groupPolicy.policyDesc.content',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.content',
      },
      {
        key: 'intentEngine',
        nameKey: 'groupPolicy.policies.intentEngine',
        descKey: 'groupPolicy.policyDesc.intentEngine',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: true,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.intentEngine',
      },
    ],
  },
  {
    key: 'stage4',
    nameKey: 'groupPolicy.stages.stage4',
    requiresAI: true,
    policies: [
      {
        key: 'phishingAgent',
        nameKey: 'groupPolicy.policies.phishingAgent',
        descKey: 'groupPolicy.policyDesc.phishingAgent',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.phishingAgent',
      },
      {
        key: 'impersonationAgent',
        nameKey: 'groupPolicy.policies.impersonationAgent',
        descKey: 'groupPolicy.policyDesc.impersonationAgent',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.impersonationAgent',
      },
      {
        key: 'retrospectAgent',
        nameKey: 'groupPolicy.policies.retrospectAgent',
        descKey: 'groupPolicy.policyDesc.retrospectAgent',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: true,
        globalDefaultKey: 'groupPolicy.globalDefaults.retrospectAgent',
      },
    ],
  },
  {
    key: 'stage5',
    nameKey: 'groupPolicy.stages.stage5',
    requiresAI: false,
    policies: [
      {
        key: 'similarDetection',
        nameKey: 'groupPolicy.policies.similarDetection',
        descKey: 'groupPolicy.policyDesc.similarDetection',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.similarDetection',
      },
      {
        key: 'advancedRules',
        nameKey: 'groupPolicy.policies.advancedRules',
        descKey: 'groupPolicy.policyDesc.advancedRules',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.advancedRules',
      },
      {
        key: 'mailMarking',
        nameKey: 'groupPolicy.policies.mailMarking',
        descKey: 'groupPolicy.policyDesc.mailMarking',
        isGlobalForced: false,
        hasParams: false,
        hasSubPolicies: false,
        isHighRisk: false,
        reserved: false,
        globalDefaultKey: 'groupPolicy.globalDefaults.mailMarking',
      },
    ],
  },
];

export function visibleStages(aiEnabled: boolean): StageDef[] {
  return STAGE_POLICIES.filter((s) => !s.requiresAI || aiEnabled);
}

export function findPolicy(policyKey: string): PolicyDef | undefined {
  for (const stage of STAGE_POLICIES) {
    const p = stage.policies.find((x) => x.key === policyKey);
    if (p) return p;
  }
  return undefined;
}

export function stageNumberOf(stageKey: string): number {
  const m = /^stage(\d+)$/.exec(stageKey);
  return m ? Number(m[1]) : 0;
}
