import { describe, it, expect } from 'vitest';
import { buildDetectionStages, deriveFinalVerdict } from '@/components/email-disposal/hooks/use-detection-stages';
import type { MailLogDetail } from '@/types/email-disposal-detail';

function baseMailLog(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: '<test@example.com>',
    message_uuid: 'uuid-1',
    client_ip: '1.2.3.4',
    sender: 'sender@example.com',
    recipients: ['rcpt@example.com'],
    authenticated: false,
    subject: 'Test',
    action: 'accept',
    status: 'delivered',
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildDetectionStages - accept action rules treated as pass', () => {
  it('shows pass when action rules fire but final action is accept', () => {
    const ml = baseMailLog({
      action: 'accept',
      matched_action_rule_pages: {
        connection: { ip_filter: [101] },
      },
    });
    const stages = buildDetectionStages(ml);
    const connection = stages.find((s) => s.key === 'connection')!;
    const ipFilter = connection.checks.find((c) => c.key === 'ipFilter')!;
    expect(ipFilter.status).toBe('pass');
    expect(ipFilter.ruleIds).toEqual([101]);
  });

  it('shows threat when action rules fire and final action is quarantine', () => {
    const ml = baseMailLog({
      action: 'quarantine',
      matched_action_rule_pages: {
        connection: { ip_filter: [101] },
      },
    });
    const stages = buildDetectionStages(ml);
    const connection = stages.find((s) => s.key === 'connection')!;
    const ipFilter = connection.checks.find((c) => c.key === 'ipFilter')!;
    expect(ipFilter.status).toBe('threat');
  });

  it('shows threat when action rules fire and final action is reject', () => {
    const ml = baseMailLog({
      action: 'reject',
      matched_action_rule_pages: {
        identity: { sender_filter: [202] },
      },
    });
    const stages = buildDetectionStages(ml);
    const identity = stages.find((s) => s.key === 'identity')!;
    const senderList = identity.checks.find((c) => c.key === 'senderList')!;
    expect(senderList.status).toBe('threat');
  });

  it('final verdict is safe when all checks pass for accepted mail', () => {
    const ml = baseMailLog({
      action: 'accept',
      matched_action_rule_pages: {
        connection: { ip_filter: [101] },
      },
    });
    const stages = buildDetectionStages(ml);
    expect(deriveFinalVerdict(stages)).toBe('safe');
  });

  it('final verdict is malicious for quarantine with action rules', () => {
    const ml = baseMailLog({
      action: 'quarantine',
      matched_action_rule_pages: {
        content: { content_rules: [303] },
      },
    });
    const stages = buildDetectionStages(ml);
    expect(deriveFinalVerdict(stages)).toBe('malicious');
  });
});

describe('buildDetectionStages - tag rules show suspicious', () => {
  it('shows suspicious when tag rules fire', () => {
    const ml = baseMailLog({
      action: 'accept',
      matched_tag_rule_pages: {
        identity: { auth_spoofing: [999] },
      },
    });
    const stages = buildDetectionStages(ml);
    const identity = stages.find((s) => s.key === 'identity')!;
    const authSpoofing = identity.checks.find((c) => c.key === 'authSpoofing')!;
    expect(authSpoofing.status).toBe('suspicious');
  });

  it('uses page projections so another recipient bucket cannot masquerade as an advanced rule', () => {
    const ml = baseMailLog({
      action: 'accept',
      // Raw storage is recipient-indexed and intentionally contains a
      // non-advanced tag. This must not light up the advanced-rule check.
      matched_tag_rules: {
        data: { 'recipient@example.com': [401] },
      },
      matched_tag_rule_pages: {
        data: { sender_filter: [401], advanced_rules: [402] },
      },
    });
    const stages = buildDetectionStages(ml);
    const comprehensive = stages.find((s) => s.key === 'comprehensive')!;
    const advanced = comprehensive.checks.find((c) => c.key === 'advancedRules')!;
    expect(advanced.status).toBe('suspicious');
    expect(advanced.ruleIds).toEqual([402]);
  });
});
