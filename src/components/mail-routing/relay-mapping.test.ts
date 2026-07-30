import { describe, it, expect } from 'vitest';
import { ruleToRow, rowToRulePayload, sortRelayRows, emptyRelayRow, type RelayRuleRow } from './relay-mapping';
import type { MailAdmissionRule } from '@/lib/api/mail-admission';

// 转发 Tab（Task 13：接通真实后端 mail-admission-rules）——MailAdmissionRule ⇄
// RelayRuleRow 映射单测。行为契约见
// .superpowers/sdd/2026-07-29-mail-routing-backend-plan/task-13-brief.md。

function baseRule(overrides: Partial<MailAdmissionRule> = {}): MailAdmissionRule {
  return {
    id: 8001,
    tenant_id: 1,
    tenant_domain_id: null,
    client_cidr: '192.168.0.0/16',
    use_spf: false,
    privileged: false,
    allow_null_sender: false,
    skip_antispam: true,
    rate_limit_per_hour: null,
    priority: 990,
    helo_pattern: '',
    helo_match: 'contains',
    rcpt_domain: 'example.cn',
    rcpt_match: 'equals',
    is_active: true,
    expires_at: null,
    note: '内网放行',
    sender_domain: 'example.cn',
    created_at: '2026-06-18 09:00:00',
    updated_at: '2026-06-18 09:00:00',
    ...overrides,
  };
}

describe('ruleToRow', () => {
  it('ALL 空 CIDR → sourceIp="ALL"', () => {
    const row = ruleToRow(baseRule({ client_cidr: '' }));
    expect(row.sourceIp).toBe('ALL');
  });

  it('非空 CIDR 原样透传', () => {
    const row = ruleToRow(baseRule({ client_cidr: '203.0.113.5,203.0.113.6' }));
    expect(row.sourceIp).toBe('203.0.113.5,203.0.113.6');
  });

  it('spamFilter 是 skip_antispam 取反', () => {
    expect(ruleToRow(baseRule({ skip_antispam: true })).spamFilter).toBe(false);
    expect(ruleToRow(baseRule({ skip_antispam: false })).spamFilter).toBe(true);
  });

  it('note → ruleName', () => {
    expect(ruleToRow(baseRule({ note: '合作伙伴转发' })).ruleName).toBe('合作伙伴转发');
  });

  it('is_active → status', () => {
    expect(ruleToRow(baseRule({ is_active: true })).status).toBe('enabled');
    expect(ruleToRow(baseRule({ is_active: false })).status).toBe('disabled');
  });

  it('priority/helo_pattern/rcpt_domain/rcpt_match 直读真实字段', () => {
    const row = ruleToRow(baseRule({ priority: 990, helo_pattern: 'partner.com', rcpt_domain: 'example.cn', rcpt_match: 'equals' }));
    expect(row.priority).toBe(990);
    expect(row.heloValue).toBe('partner.com');
    expect(row.rcptDomain).toBe('example.cn');
    expect(row.rcptMatchType).toBe('equals');
  });

  it('rcpt_match=regex/contains 原样透传', () => {
    expect(ruleToRow(baseRule({ rcpt_match: 'contains' })).rcptMatchType).toBe('contains');
    expect(ruleToRow(baseRule({ rcpt_match: 'regex' })).rcptMatchType).toBe('regex');
  });

  it('sender_domain 原样透传为 fromDomain（含空串）', () => {
    expect(ruleToRow(baseRule({ sender_domain: 'partner.com' })).fromDomain).toBe('partner.com');
    expect(ruleToRow(baseRule({ sender_domain: '' })).fromDomain).toBe('');
  });
});

describe('rowToRulePayload', () => {
  const row: RelayRuleRow = {
    id: 8001,
    ruleName: '内网放行',
    priority: 990,
    sourceIp: 'ALL',
    useSpf: false,
    heloValue: '',
    fromDomain: 'example.cn',
    rcptDomain: 'example.cn',
    rcptMatchType: 'equals',
    spamFilter: false,
    status: 'enabled',
    updatedAt: '2026-06-18 09:00:00',
  };

  it('sourceIp="ALL" → client_cidr 空串（双向：ALL↔空 CIDR）', () => {
    expect(rowToRulePayload(row).client_cidr).toBe('');
    expect(rowToRulePayload({ ...row, sourceIp: '' }).client_cidr).toBe('');
  });

  it('非 ALL sourceIp 原样透传为 client_cidr', () => {
    expect(rowToRulePayload({ ...row, sourceIp: '192.168.0.0/16' }).client_cidr).toBe('192.168.0.0/16');
  });

  it('spamFilter 取反写回 skip_antispam', () => {
    expect(rowToRulePayload({ ...row, spamFilter: true }).skip_antispam).toBe(false);
    expect(rowToRulePayload({ ...row, spamFilter: false }).skip_antispam).toBe(true);
  });

  it('ruleName → note', () => {
    expect(rowToRulePayload({ ...row, ruleName: '合作伙伴转发' }).note).toBe('合作伙伴转发');
  });

  it('status → is_active', () => {
    expect(rowToRulePayload({ ...row, status: 'enabled' }).is_active).toBe(true);
    expect(rowToRulePayload({ ...row, status: 'disabled' }).is_active).toBe(false);
  });

  it('fromDomain 空串 → sender_domain 为 null', () => {
    expect(rowToRulePayload({ ...row, fromDomain: '' }).sender_domain).toBeNull();
    expect(rowToRulePayload({ ...row, fromDomain: 'partner.com' }).sender_domain).toBe('partner.com');
  });

  it('priority/heloValue/rcptDomain/rcptMatchType 直写真实字段', () => {
    const payload = rowToRulePayload(row);
    expect(payload.priority).toBe(990);
    expect(payload.helo_pattern).toBe('');
    expect(payload.rcpt_domain).toBe('example.cn');
    expect(payload.rcpt_match).toBe('equals');
  });
});

// GT-12329 review Important I9：新建准入规则的安全默认必须是"开反垃圾"
// （skip_antispam=false），与后端 mail_admission_rules.skip_antispam 的零值默认
// （INT NOT NULL DEFAULT 0）一致——不能让 UI 的默认草稿悄悄创建出一条对匹配邮件关闭
// 反垃圾的规则。
describe('emptyRelayRow', () => {
  it('defaults spamFilter=true (skip_antispam=false), matching the backend zero-value default', () => {
    const draft = emptyRelayRow();
    expect(draft.spamFilter).toBe(true);
    expect(rowToRulePayload(draft).skip_antispam).toBe(false);
  });
});

describe('sortRelayRows', () => {
  it('按优先级降序（大值优先）', () => {
    const rows: RelayRuleRow[] = [
      { ...emptyRelayRow(), id: 1, priority: 1 },
      { ...emptyRelayRow(), id: 2, priority: 990 },
      { ...emptyRelayRow(), id: 3, priority: 950 },
    ];
    expect(sortRelayRows(rows).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('相同优先级按 id 稳定排序', () => {
    const rows: RelayRuleRow[] = [
      { ...emptyRelayRow(), id: 5, priority: 100 },
      { ...emptyRelayRow(), id: 1, priority: 100 },
      { ...emptyRelayRow(), id: 3, priority: 100 },
    ];
    expect(sortRelayRows(rows).map((r) => r.id)).toEqual([1, 3, 5]);
  });
});
