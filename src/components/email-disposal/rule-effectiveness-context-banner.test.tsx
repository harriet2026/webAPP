import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { RuleEffectivenessContextBanner } from './rule-effectiveness-context-banner';

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
}));

function bannerText(policyKey: string, subStrategy: string): string {
  search = new URLSearchParams({ source: 'rule_effectiveness', policy_key: policyKey, sub_strategy: subStrategy, strategy_name: subStrategy });
  const { unmount } = render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <RuleEffectivenessContextBanner />
    </NextIntlClientProvider>,
  );
  const text = screen.getByTestId('disposal-rule-effectiveness-context-banner').textContent ?? '';
  unmount();
  return text;
}

// GT-14322：命中详情链接携带后端对象键（方案 §14：下钻使用原始对象键），提示条必须与
// 统计表复用同一套展示映射，显示中文策略路径而不是内部标识。
describe('RuleEffectivenessContextBanner strategy path (GT-14322)', () => {
  it.each([
    ['format_check.mailfrom_empty', '身份认证与仿冒检测 / 基础格式检查 / 空MAIL FROM'],
    ['format_check.mailfrom_invalid', '身份认证与仿冒检测 / 基础格式检查 / 无效MAIL FROM'],
    ['format_check.envelope_header_mismatch', '身份认证与仿冒检测 / 基础格式检查 / 信封头不一致'],
    ['display_name_spoof.inbound', '身份认证与仿冒检测 / 展示名仿冒检测 / 收件方向'],
    ['similar_domain.main', '身份认证与仿冒检测 / 相似域名检测'],
    // 展示键（统计表同源）与协议结果级标识照常可用
    ['format_check_mailfrom_empty', '身份认证与仿冒检测 / 基础格式检查 / 空MAIL FROM'],
  ])('auth_spoofing %s', (key, expected) => {
    const text = bannerText('auth_spoofing', key);
    expect(text).toContain(expected);
    expect(text).not.toContain(key.includes('.') ? key : '\u0000');
  });

  it.each([
    ['similar_email.receive', '相似检测 / 相似邮件检测 / 接收方向'],
    ['same_subject.send', '相似检测 / 相同主题检测 / 外发方向'],
    ['same_subject.internal', '相似检测 / 相同主题检测 / 域内方向'],
    ['similar_email.aggregate', '相似检测 / 相似邮件检测 / 全方向聚合'],
    // 原型 Mock 的下钻写法「类型:方向」
    ['same_subject:send', '相似检测 / 相同主题检测 / 外发方向'],
  ])('similar_detection %s', (key, expected) => {
    expect(bannerText('similar_detection', key)).toContain(expected);
  });

  // GT-14347：钓鱼检测智能体提示条标识到具体对象（链接携带名称快照 strategy_name）。
  it.each([
    ['runtime_policy', '运行时策略', '钓鱼检测智能体 / 运行时策略'],
    ['risk_policy', '风险处置策略', '钓鱼检测智能体 / 风险处置策略'],
    ['admission:8f1c2d3e-uid', '外部链接邮件', '钓鱼检测智能体 / 准入规则 / 外部链接邮件'],
  ])('phishing_detection %s', (key, name, expected) => {
    search = new URLSearchParams({ source: 'rule_effectiveness', policy_key: 'phishing_detection', sub_strategy: key, strategy_name: name });
    const { unmount } = render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <RuleEffectivenessContextBanner />
      </NextIntlClientProvider>,
    );
    const text = screen.getByTestId('disposal-rule-effectiveness-context-banner').textContent ?? '';
    unmount();
    expect(text).toContain(expected);
    expect(text).not.toContain('8f1c2d3e-uid');
  });
});


describe('phishing disposition context', () => {
  it('keeps the prototype context limited to the source path and return action', () => {
    search = new URLSearchParams({ source: 'rule_effectiveness', policy_key: 'phishing_detection', sub_strategy: 'disposition:high' });
    render(<NextIntlClientProvider locale="zh" messages={zh as never}>
      <RuleEffectivenessContextBanner />
    </NextIntlClientProvider>);
    expect(screen.getByTestId('disposal-rule-effectiveness-context-banner')).toHaveTextContent(/^来自规则效能统计：钓鱼检测智能体 \/ 风险处置策略 \/ 高风险返回规则效能统计$/);
  });
});


describe('GT-14083 added observation-module contexts', () => {
  it.each(['BEHAVIOR', 'behavior_control', 'content_rules', 'advanced_filter_rules', 'recipient_check'])(
    '%s keeps the prototype rule-name context', (policyKey) => {
      expect(bannerText(policyKey, '原型规则名称')).toContain('来自规则效能统计：原型规则名称');
    },
  );
  it.each([
    ['intent_engine', 'receive:phishing', '意图引擎 / 收件方向 / 钓鱼'],
    ['attachment_security', 'antivirus', '附件安全检测 / 反病毒引擎'],
  ])('%s keeps its backend object key readable', (policyKey, key, expected) => {
    expect(bannerText(policyKey, key)).toContain(expected);
  });
});
