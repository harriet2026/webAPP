import { describe, expect, it } from 'vitest';
import type { AgentCenterCard } from '@/types/agent-center';
import { resolveAgentPresentation } from './presentation';

const phishingCard: AgentCenterCard = {
  key: 'phishing',
  module_key: 'phishing_agent',
  feature_id: 'phishing-detection',
  access: 'enabled',
  status: 'running',
  stage_position: '4.0',
  policy_pages: [
    { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
    { page: 'phishing_disposition', role: 'disposition', management: 'dedicated' },
  ],
  today_processed: 12,
  hit_count: 3,
  processed_count: 12,
  hit_rate: 0.25,
};

describe('resolveAgentPresentation', () => {
  it('enables the dedicated phishing configuration route for the exact public contract', () => {
    const resolved = resolveAgentPresentation(phishingCard);

    expect(resolved).toMatchObject({
      moduleKey: 'phishing_agent',
      agentKey: 'phishing',
      pipelineKey: 'phishingAgent',
      pipelineType: 'ai-sync',
      canConfigure: true,
      configHref: '/agent-center/overview?agent=phishing&tab=config',
    });
  });

  it('fails closed when backend management metadata is missing or inconsistent', () => {
    const cases: AgentCenterCard[] = [
      { ...phishingCard, module_key: '' },
      { ...phishingCard, module_key: 'future_agent' },
      { ...phishingCard, policy_pages: phishingCard.policy_pages!.slice(0, 1) },
      {
        ...phishingCard,
        policy_pages: [phishingCard.policy_pages![0], phishingCard.policy_pages![0]],
      },
      {
        ...phishingCard,
        policy_pages: phishingCard.policy_pages!.map((page, index) => (
          index === 0 ? { ...page, role: 'future_role' } : page
        )),
      },
      {
        ...phishingCard,
        policy_pages: phishingCard.policy_pages!.map((page, index) => (
          index === 0 ? { ...page, management: 'future_management' } : page
        )),
      },
    ];

    for (const card of cases) {
      const resolved = resolveAgentPresentation(card);
      expect(resolved?.canConfigure).toBe(false);
      expect(resolved?.configHref).toBeUndefined();
    }
  });
});
