import { describe, it, expect } from 'vitest';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import { buildDetectionStages } from './use-detection-stages';

function baseDetail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: 'm1',
    message_uuid: 'uuid-1',
    client_ip: '203.0.113.5',
    sender: 'attacker@evil.com',
    recipients: ['a@company.com', 'b@company.com', 'c@company.com'],
    authenticated: false,
    subject: 'test',
    action: 'quarantine',
    status: 'quarantined',
    received_at: '2026-07-20T10:00:00Z',
    ...overrides,
  };
}

describe('buildDetectionStages recipientGroups (群发多依据归因)', () => {
  it('单收件人/非群发场景下 recipientGroups 长度 <= 1，与现状渲染路径等价', () => {
    const detail = baseDetail({
      recipients: ['a@company.com'],
      matched_action_rule_pages: { content: { attachment_security: [101] } },
      matched_action_rules: { content: { 'a@company.com': [101] } },
    });
    const stages = buildDetectionStages(detail);
    const contentStage = stages.find((s) => s.key === 'content')!;
    const check = contentStage.checks.find((c) => c.key === 'attachmentSecurity')!;
    expect(check.status).toBe('threat');
    expect(check.recipientGroups?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('群发邮件不同收件人命中不同规则时，按命中规则集合分组', () => {
    const detail = baseDetail({
      matched_action_rule_pages: { content: { attachment_security: [101, 102] } },
      matched_action_rules: {
        content: {
          'a@company.com': [101],
          'b@company.com': [101],
          'c@company.com': [102],
        },
      },
    });
    const stages = buildDetectionStages(detail);
    const contentStage = stages.find((s) => s.key === 'content')!;
    const check = contentStage.checks.find((c) => c.key === 'attachmentSecurity')!;
    expect(check.ruleIds.sort()).toEqual([101, 102]);
    expect(check.recipientGroups).toHaveLength(2);

    const groupA = check.recipientGroups!.find((g) => g.ruleIds.includes(101))!;
    expect(groupA.recipients.sort()).toEqual(['a@company.com', 'b@company.com']);
    const groupB = check.recipientGroups!.find((g) => g.ruleIds.includes(102))!;
    expect(groupB.recipients).toEqual(['c@company.com']);
  });

  it('交叉引用只按 ruleId 精确匹配，不会把不相关的收件人规则记录误标进这个 check (GT-12194 同样的谨慎原则)', () => {
    const detail = baseDetail({
      // ip_filter 命中规则 201，不属于本 check (attachment_security) 的 page 范围。
      matched_action_rule_pages: {
        connection: { ip_filter: [201] },
        content: { attachment_security: [101] },
      },
      matched_action_rules: {
        connection: { 'a@company.com': [201] },
        content: { 'b@company.com': [101] },
      },
    });
    const stages = buildDetectionStages(detail);
    const contentStage = stages.find((s) => s.key === 'content')!;
    const check = contentStage.checks.find((c) => c.key === 'attachmentSecurity')!;
    expect(check.ruleIds).toEqual([101]);
    expect(check.recipientGroups).toHaveLength(1);
    expect(check.recipientGroups![0].recipients).toEqual(['b@company.com']);
  });

  it('AI 阶段没有 ruleIds，天然没有 recipientGroups', () => {
    const detail = baseDetail({ cac_result: { tag: 'phishing', int_tag: 6 } });
    const stages = buildDetectionStages(detail);
    const aiStage = stages.find((s) => s.key === 'ai')!;
    for (const check of aiStage.checks) {
      expect(check.recipientGroups ?? []).toEqual([]);
    }
  });
});
