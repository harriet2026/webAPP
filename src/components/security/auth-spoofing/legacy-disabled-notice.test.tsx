import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProtocolChecksSection } from './ProtocolChecksSection';
import { FormatChecksSection } from './FormatChecksSection';
import { CheckItemRow } from './CheckItemRow';
import type { CheckItem, FormatChecksConfig, ProtocolChecksConfig } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';

type IntlMessages = React.ComponentProps<typeof NextIntlClientProvider>['messages'];

const wrap = (ui: React.ReactNode, messages: IntlMessages = zh, locale = 'zh') => (
  <NextIntlClientProvider locale={locale} messages={messages}>
    {ui}
  </NextIntlClientProvider>
);

const item = (action: CheckItem['action'], enabled = true): CheckItem => ({
  enabled,
  action,
  observe_mode: false,
});

function protocolConfig(overrides: Partial<ProtocolChecksConfig> = {}): ProtocolChecksConfig {
  return {
    template: 'custom',
    observe_mode: false,
    spf: {
      fail: item('reject'),
      softfail: item('quarantine'),
      none: item('proceed', false),
      temperror: item('proceed'),
    },
    dkim: { fail: item('quarantine'), neutral: item('quarantine'), partial: item('proceed'), none: item('proceed') },
    dmarc: { reject: item('reject'), quarantine: item('quarantine'), none: item('proceed') },
    ptr: { noptr: item('proceed'), nomatch: item('quarantine'), ehlo_mismatch: item('quarantine') },
    ...overrides,
  };
}

function formatConfig(overrides: Partial<FormatChecksConfig> = {}): FormatChecksConfig {
  return {
    mailfrom_empty: item('proceed', false),
    mailfrom_invalid: item('reject'),
    envelope_header_mismatch: item('quarantine'),
    ...overrides,
  };
}

describe('存量 {enabled:false} 检查项的未启用提示', () => {
  it('协议检查：未启用的行标出「此项当前未启用」并给出无法恢复的提示', () => {
    render(wrap(<ProtocolChecksSection config={protocolConfig()} onChange={() => {}} />));
    // spf 是默认选中的 tab，spf.none 就是那条存量行
    expect(screen.getByTestId('legacy-disabled-spf-none')).toHaveTextContent('此项当前未启用');
    expect(screen.getByText(/一旦把此项改为其他动作，将无法再恢复为未启用/)).toBeInTheDocument();
  });

  it('协议检查：全部启用时不出现未启用提示', () => {
    const cfg = protocolConfig();
    cfg.spf.none = item('proceed');
    render(wrap(<ProtocolChecksSection config={cfg} onChange={() => {}} />));
    expect(screen.queryByTestId('legacy-disabled-spf-none')).toBeNull();
    expect(screen.queryByText(/一旦把此项改为其他动作/)).toBeNull();
  });

  it('格式检查：未启用的行同样标出提示', () => {
    render(wrap(<FormatChecksSection config={formatConfig()} onChange={() => {}} />));
    expect(
      screen.getByTestId('legacy-disabled-formatChecks.mailFromEmpty'),
    ).toHaveTextContent('此项当前未启用');
    expect(screen.getAllByText(/一旦把此项改为其他动作，将无法再恢复为未启用/).length).toBe(1);
  });

  it('四种语言都有文案，不会漏出原始 key', () => {
    for (const [locale, messages] of [
      ['zh', zh],
      ['en', en],
      ['ru', ru],
      ['th', th],
    ] as const) {
      const { unmount } = render(
        wrap(<FormatChecksSection config={formatConfig()} onChange={() => {}} />, messages, locale),
      );
      const badge = screen.getByTestId('legacy-disabled-formatChecks.mailFromEmpty');
      expect(badge.textContent, locale).toBeTruthy();
      expect(badge.textContent, locale).not.toContain('authSpoofing.legacyDisabled');
      unmount();
    }
  });
});

describe('「投递」已从认证仿冒的动作下拉里移除', () => {
  it('CheckItemRow 的动作下拉不再包含 accept', () => {
    render(
      wrap(
        <CheckItemRow label="显示名仿冒" item={item('quarantine')} onChange={() => {}} />,
      ),
    );
    // 「投递」是 accept 的中文文案（authSpoofing.action.accept）
    expect(screen.queryByRole('option', { name: '投递' })).toBeNull();
  });
});
