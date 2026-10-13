import { describe, expect, it } from 'vitest';
import { formatHitDetail, formatListReason, formatRuleLabel, getModuleName, getPolicyMeta, getPolicyRoute, groupDisposalModulesByStage, isStage1Policy } from './disposal-basis-config';

describe('mail admission disposal evidence', () => {
  const basis = {
    policy_key: 'MAIL-ADMISSION', rule_id: 'MAIL-ADMISSION-42', rule_name: '合作方不过滤', action: 'accept',
    recipients: ['person@one.test'],
    hit_values: { source_ip: '192.168.201.86', sender: 'partner@outside.test', client_cidr: '192.168.201.0/24', rcpt_domain: 'one.test', recipient_domain: 'one.test', skip_antispam: 'true' },
  };

  it('shows the actual routing owner, name and exemption evidence', () => {
    expect(getModuleName(basis.policy_key)).toBe('邮件路由 / 转发设置');
    expect(formatListReason(basis)).toContain('合作方不过滤');
    expect(formatListReason(basis)).toContain('命中不过滤准入规则并放行');
    expect(formatHitDetail(basis)).toContain('192.168.201.0/24');
    expect(formatHitDetail(basis)).toContain('实际来源 IP：192.168.201.86');
    expect(formatHitDetail(basis)).toContain('实际发信人：partner@outside.test');
    expect(formatHitDetail(basis)).toContain('实际收信域：one.test');
    expect(formatRuleLabel(basis, (key) => key)).toContain('MAIL-ADMISSION-42');
    expect(isStage1Policy(basis.policy_key)).toBe(false);
    expect(getPolicyMeta(basis.policy_key)?.stage).toBe(0);
  });

  it('keeps admission outside the security stages and makes it filterable', () => {
    expect(groupDisposalModulesByStage()).toContainEqual({ stage: 0, moduleName: '邮件路由 / 转发设置', keys: ['MAIL-ADMISSION'] });
    expect(getPolicyRoute(basis.policy_key, basis.rule_id, 7)).toBe('/mail-routing?tab=relay&config=42&tenant_id=7');
  });

  it('does not fabricate exemption evidence for an incomplete historical record', () => {
    expect(formatListReason({ ...basis, hit_values: {} })).not.toContain('并放行');
    for (const lang of ['zh', 'en', 'th', 'ru'] as const) {
      expect(formatRuleLabel({ ...basis, rule_name: 'mail_admission whitelist' }, (key) => key, lang)).not.toContain('mail_admission');
      expect(getModuleName(basis.policy_key, lang)).not.toBe('');
      expect(formatHitDetail(basis, lang)).toContain('192.168.201.86');
      expect(formatHitDetail(basis, lang)).toContain('partner@outside.test');
      expect(formatHitDetail({ ...basis, hit_values: {} }, lang)).not.toContain('192.168.201.86');
    }
  });

  it('formats all recorded domains for one rule rather than treating sampled evidence as the whole scope', () => {
    const multi = { ...basis, recipients: ['b@Two.test', 'a@one.test', 'c@two.test'] };
    for (const lang of ['zh', 'en', 'th', 'ru'] as const) {
      const detail = formatHitDetail(multi, lang);
      expect(detail).toContain(lang === 'zh' ? 'one.test、two.test' : 'one.test, two.test');
    }
    expect(formatHitDetail({ ...basis, recipients: undefined })).toContain('实际收信域（命中示例）：one.test');
    expect(formatHitDetail({ ...basis, recipients: undefined, hit_values: {} })).not.toContain('one.test');
  });
});
