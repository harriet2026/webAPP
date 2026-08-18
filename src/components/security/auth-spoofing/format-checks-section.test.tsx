import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FormatChecksSection } from './FormatChecksSection';
import type { FormatChecksConfig, CheckItem } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as any}>
    {ui}
  </NextIntlClientProvider>
);

const item = (overrides: Partial<CheckItem> = {}): CheckItem => ({
  enabled: true,
  // 「允许」(accept) 已从认证仿冒移除，默认取一个仍在下拉里的动作。
  action: 'quarantine',
  observe_mode: false,
  ...overrides,
});

function makeConfig(overrides: Partial<FormatChecksConfig> = {}): FormatChecksConfig {
  return {
    mailfrom_empty: item(),
    mailfrom_invalid: item(),
    envelope_header_mismatch: item(),
    ...overrides,
  };
}

describe('FormatChecksSection', () => {
  it('shows the high-risk warning when action=reject and observe_mode=false', () => {
    const config = makeConfig({
      mailfrom_invalid: item({ action: 'reject', observe_mode: false, enabled: true }),
    });
    render(wrap(<FormatChecksSection config={config} onChange={() => {}} />));
    expect(screen.getAllByText(/高风险动作/)[0]).toBeInTheDocument();
  });

  it('shows a read-only "allow (log only)" chip and pulsing "observing" badge when observe_mode=true, and hides the high-risk warning', () => {
    const config = makeConfig({
      mailfrom_invalid: item({ action: 'reject', observe_mode: true, enabled: true }),
    });
    const { container } = render(wrap(<FormatChecksSection config={config} onChange={() => {}} />));
    expect(screen.getByText('允许（仅记录）')).toBeInTheDocument();
    expect(screen.getByText('观察中')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText(/高风险动作/)).toBeNull();
  });

  it('renders the persistent description text for each check item', () => {
    const config = makeConfig();
    render(wrap(<FormatChecksSection config={config} onChange={() => {}} />));
    expect(screen.getByText(/检查SMTP信封发信人是否为空/)).toBeInTheDocument();
    expect(screen.getByText(/检查发信人地址格式是否符合RFC标准/)).toBeInTheDocument();
    expect(screen.getByText(/检查邮件头中的From发信人与SMTP信封Mail From是否一致/)).toBeInTheDocument();
  });
});
