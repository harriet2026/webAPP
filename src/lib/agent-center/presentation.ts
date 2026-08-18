import type { AgentCenterCard, AgentCenterKey, AgentCenterPolicyPage } from '@/types/agent-center';

export type AgentModuleKey = 'phishing_agent' | 'spoofing_agent' | 'threat_retro_agent';

interface ExpectedPolicyPage {
  page: string;
  role: 'admission' | 'disposition' | 'strategy';
  management: 'dedicated' | 'internal';
}

export interface AgentPresentation {
  moduleKey: AgentModuleKey;
  agentKey: AgentCenterKey;
  pipelineKey: 'phishingAgent' | 'spoofingAgent' | 'threatRetroAgent';
  pipelineNameKey: 'pipeline.phishingAgent' | 'pipeline.spoofingAgent' | 'pipeline.threatRetroAgent';
  pipelineDescKey: 'pipeline.phishingAgentDesc' | 'pipeline.spoofingAgentDesc' | 'pipeline.threatRetroAgentDesc';
  pipelineType: 'ai-sync' | 'ai-async';
  configTab: 'config' | 'sender-name' | 'strategy';
  requiredPages: readonly ExpectedPolicyPage[];
}

export type ResolvedAgentPresentation = AgentPresentation & {
  canConfigure: boolean;
  configHref?: string;
};

export const AGENT_PRESENTATION_ORDER = [
  'phishing_agent',
  'spoofing_agent',
  'threat_retro_agent',
] as const satisfies readonly AgentModuleKey[];

export const AGENT_PRESENTATIONS: Record<AgentModuleKey, AgentPresentation> = {
  phishing_agent: {
    moduleKey: 'phishing_agent',
    agentKey: 'phishing',
    pipelineKey: 'phishingAgent',
    pipelineNameKey: 'pipeline.phishingAgent',
    pipelineDescKey: 'pipeline.phishingAgentDesc',
    pipelineType: 'ai-sync',
    configTab: 'config',
    requiredPages: [
      { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
      { page: 'phishing_disposition', role: 'disposition', management: 'dedicated' },
    ],
  },
  spoofing_agent: {
    moduleKey: 'spoofing_agent',
    agentKey: 'spoofing',
    pipelineKey: 'spoofingAgent',
    pipelineNameKey: 'pipeline.spoofingAgent',
    pipelineDescKey: 'pipeline.spoofingAgentDesc',
    pipelineType: 'ai-sync',
    configTab: 'sender-name',
    requiredPages: [
      { page: 'spoofing_admission', role: 'admission', management: 'internal' },
      { page: 'spoofing_disposition', role: 'disposition', management: 'internal' },
    ],
  },
  threat_retro_agent: {
    moduleKey: 'threat_retro_agent',
    agentKey: 'threat-retro',
    pipelineKey: 'threatRetroAgent',
    pipelineNameKey: 'pipeline.threatRetroAgent',
    pipelineDescKey: 'pipeline.threatRetroAgentDesc',
    pipelineType: 'ai-async',
    configTab: 'strategy',
    requiredPages: [
      { page: 'threat_retro_strategy', role: 'strategy', management: 'dedicated' },
    ],
  },
};

const PRESENTATIONS_BY_AGENT = Object.fromEntries(
  Object.values(AGENT_PRESENTATIONS).map((presentation) => [presentation.agentKey, presentation]),
) as Record<AgentCenterKey, AgentPresentation>;

function configHref(presentation: AgentPresentation): string {
  return `/agent-center/overview?agent=${presentation.agentKey}&tab=${presentation.configTab}`;
}

function hasExpectedPolicyPages(
  pages: AgentCenterPolicyPage[] | undefined,
  expected: readonly ExpectedPolicyPage[],
): boolean {
  if (!pages || pages.length !== expected.length) return false;
  return expected.every((want, index) => {
    const got = pages[index];
    return got.page === want.page
      && got.role === want.role
      && got.management === want.management;
  });
}

export function resolveAgentPresentation(card: AgentCenterCard): ResolvedAgentPresentation | undefined {
  const display = PRESENTATIONS_BY_AGENT[card.key];
  if (!display) return undefined;

  const modulePresentation = AGENT_PRESENTATIONS[card.module_key as AgentModuleKey];
  const metadataMatches = modulePresentation === display
    && hasExpectedPolicyPages(card.policy_pages, display.requiredPages);
  const canConfigure = card.access === 'enabled'
    && card.status !== 'locked'
    && metadataMatches;

  return {
    ...display,
    canConfigure,
    configHref: canConfigure ? configHref(display) : undefined,
  };
}
