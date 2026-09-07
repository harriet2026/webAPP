export type PipelineModuleKey =
  | 'ipFrequency'
  | 'ipFilter'
  | 'rbl'
  | 'overseas'
  | 'senderFilter'
  | 'authSpoofing'
  | 'behaviorControl'
  | 'recipientCheck'
  | 'userList'
  | 'content'
  | 'attachment'
  | 'url'
  | 'intentEngine'
  | 'similarDetection'
  | 'advancedRules'
  | 'mailMarking';

export interface PipelineDeepLink {
  stage: 1 | 2 | 3 | 5;
  key: PipelineModuleKey;
  ruleRef?: string;
  ruleDatabaseID?: number;
}

interface PipelineTarget {
  kind: 'pipeline';
  stage: PipelineDeepLink['stage'];
  key: PipelineModuleKey;
}

interface AgentTarget {
  kind: 'agent';
  agent: 'phishing' | 'spoofing' | 'threat-retro';
  tab: 'config' | 'sender-name' | 'strategy';
}

type PolicyTarget = PipelineTarget | AgentTarget;

// Disposal policy keys are runtime identities, while the pipeline uses UI
// module keys. Keep the translation in one place so every evidence link opens
// the same module that owns the matching rule.
const POLICY_TARGETS: Record<string, PolicyTarget> = {
  IPFREQ: { kind: 'pipeline', stage: 1, key: 'ipFrequency' },
  IPBL: { kind: 'pipeline', stage: 1, key: 'ipFilter' },
  RBL: { kind: 'pipeline', stage: 1, key: 'rbl' },
  OVERSEAS: { kind: 'pipeline', stage: 1, key: 'overseas' },
  SBL: { kind: 'pipeline', stage: 2, key: 'senderFilter' },
  AUTH: { kind: 'pipeline', stage: 2, key: 'authSpoofing' },
  BEHAVIOR: { kind: 'pipeline', stage: 2, key: 'behaviorControl' },
  RCPT: { kind: 'pipeline', stage: 2, key: 'recipientCheck' },
  UBL: { kind: 'pipeline', stage: 2, key: 'userList' },
  'ATT-BASIC': { kind: 'pipeline', stage: 3, key: 'attachment' },
  'ATT-AV': { kind: 'pipeline', stage: 3, key: 'attachment' },
  'ATT-QR': { kind: 'pipeline', stage: 3, key: 'attachment' },
  'ATT-ENC': { kind: 'pipeline', stage: 3, key: 'attachment' },
  URL: { kind: 'pipeline', stage: 3, key: 'url' },
  CR: { kind: 'pipeline', stage: 3, key: 'content' },
  INTENT: { kind: 'pipeline', stage: 3, key: 'intentEngine' },
  'AI-PHISH': { kind: 'agent', agent: 'phishing', tab: 'config' },
  'AI-SPOOF': { kind: 'agent', agent: 'spoofing', tab: 'sender-name' },
  'AI-TRACE': { kind: 'agent', agent: 'threat-retro', tab: 'strategy' },
  SIM: { kind: 'pipeline', stage: 5, key: 'similarDetection' },
  ACF: { kind: 'pipeline', stage: 5, key: 'advancedRules' },
  'MAIL-MARK': { kind: 'pipeline', stage: 5, key: 'mailMarking' },
};

const PIPELINE_TARGETS_BY_MODULE = new Map<PipelineModuleKey, PipelineTarget>(
  Object.values(POLICY_TARGETS)
    .filter((target): target is PipelineTarget => target.kind === 'pipeline')
    .map((target) => [target.key, target]),
);

export function parseRuleDatabaseID(ruleRef?: string): number | undefined {
  const value = ruleRef?.trim();
  if (!value) return undefined;
  const match = value.match(/^(?:[A-Z][A-Z0-9-]*-)?(\d+)$/);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function buildPolicyConfigRoute(policyKey: string, ruleRef?: string): string | undefined {
  const target = POLICY_TARGETS[policyKey];
  if (!target) return undefined;

  const params = new URLSearchParams();
  if (target.kind === 'agent') {
    params.set('agent', target.agent);
    params.set('tab', target.tab);
    if (ruleRef?.trim()) params.set('rule_id', ruleRef.trim());
    return `/agent-center/overview?${params.toString()}`;
  }

  params.set('module', target.key);
  if (ruleRef?.trim()) params.set('rule_id', ruleRef.trim());
  return `/security/pipeline?${params.toString()}`;
}

export function parsePipelineDeepLink(
  params: Pick<URLSearchParams, 'get'>,
): PipelineDeepLink | undefined {
  const moduleKey = params.get('module') as PipelineModuleKey | null;
  if (!moduleKey) return undefined;
  const target = PIPELINE_TARGETS_BY_MODULE.get(moduleKey);
  if (!target) return undefined;

  const ruleRef = params.get('rule_id')?.trim() || undefined;
  const ruleDatabaseID = parseRuleDatabaseID(ruleRef);
  return {
    stage: target.stage,
    key: target.key,
    ...(ruleRef ? { ruleRef } : {}),
    ...(ruleDatabaseID ? { ruleDatabaseID } : {}),
  };
}
