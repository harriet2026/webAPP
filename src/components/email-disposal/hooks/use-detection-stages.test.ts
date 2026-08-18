import { describe, expect, it } from 'vitest';

import type { MailLogDetail } from '@/types/email-disposal-detail';
import { buildDetectionStages } from './use-detection-stages';

function detail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: '<m@test>',
    message_uuid: '00000000-0000-0000-0000-000000000001',
    client_ip: '192.0.2.1',
    sender: 'sender@test',
    recipients: ['rcpt@test'],
    authenticated: false,
    action: 'quarantine',
    status: 'quarantined',
    direction: 'receive',
    email_type: 'normal',
    received_at: '2026-08-16T00:00:00Z',
    ...overrides,
  } as MailLogDetail;
}

describe('buildDetectionStages module catalog', () => {
  it('matches the product stage 3/5 catalog and real rule page names', () => {
    const stages = buildDetectionStages(detail({
      matched_action_rule_pages: {
        data: {
          link_attachment_security: [11],
          intent_engine: [12],
          similar_detection: [13],
          advanced_rules: [14],
          mail_marking: [15],
        },
      },
    }));

    expect(stages[2].checks.map((check) => check.key)).toEqual([
      'attachmentSecurity', 'urlProtection', 'contentRules', 'intentEngine',
    ]);
    expect(stages[2].checks.find((check) => check.key === 'urlProtection')?.ruleIds).toEqual([11]);
    expect(stages[2].checks.find((check) => check.key === 'intentEngine')?.ruleIds).toEqual([12]);
    expect(stages[4].checks.map((check) => check.key)).toEqual([
      'similarityDetection', 'advancedRules', 'mailMarking',
    ]);
    expect(stages[4].checks.find((check) => check.key === 'mailMarking')).toMatchObject({ status: 'pass', ruleIds: [15] });
  });

  it('uses agent rule pages and assessment basis instead of permanently skipping agents', () => {
    const stages = buildDetectionStages(detail({
      matched_action_rule_pages: { sideline: { phishing_disposition: [21] } },
      matched_tag_rule_pages: { data: { spoofing_admission: [22] } },
      disposal_basis: {
        policy_key: 'AI-PHISH', action: 'quarantine',
        modules: [{ policy_key: 'AI-TRACE', action: 'quarantine' }],
      },
    }));
    const ai = stages[3].checks;
    expect(ai.find((check) => check.key === 'phishingAgent')).toMatchObject({ status: 'threat', ruleIds: [21] });
    expect(ai.find((check) => check.key === 'spoofingAgent')).toMatchObject({ status: 'suspicious', ruleIds: [22] });
    expect(ai.find((check) => check.key === 'threatRetroAgent')?.status).toBe('threat');
  });

  it('uses each agent module action and keeps an in-flight AI stage processing', () => {
    const fromBasis = buildDetectionStages(detail({
      disposal_basis: {
        policy_key: 'CR', action: 'quarantine',
        modules: [{ policy_key: 'AI-SPOOF', action: 'accept' }],
      },
    }));
    expect(fromBasis[3].checks.find((check) => check.key === 'spoofingAgent')?.status).toBe('pass');

    const processing = buildDetectionStages(detail({
      phish_agent_check: { status: 'running', checked: false },
    }));
    expect(processing[3].checks.find((check) => check.key === 'phishingAgent')?.status).toBe('processing');
    expect(processing[3].status).toBe('processing');
  });
});
