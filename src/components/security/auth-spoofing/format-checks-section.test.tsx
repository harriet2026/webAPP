import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { FormatChecksSection } from './FormatChecksSection';
import type { FormatChecksConfig, CheckItem } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
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

  it.each(['reject', 'discard'] as const)('keeps the %s action selector and high-risk warning while observing', (action) => {
    const config = makeConfig({
      mailfrom_invalid: item({ action, observe_mode: true, enabled: true }),
    });
    const { container } = render(wrap(<FormatChecksSection config={config} onChange={() => {}} />));
    expect(screen.queryByText('允许（仅记录）')).toBeNull();
    expect(screen.getByTestId('auth-format-action-mailfrom_invalid'))
      .toHaveTextContent(action === 'reject' ? '拒收' : '丢弃');
    expect(screen.getByTestId('auth-format-action-mailfrom_invalid')).toBeEnabled();
    expect(screen.getByText('观察中')).toBeInTheDocument();
    expect(screen.getByTestId('auth-format-observing-mailfrom_invalid')).toHaveTextContent('观察中');
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.getByTestId('auth-format-highrisk-mailfrom_invalid')).toHaveTextContent('高风险动作');
  });

  it('lets an observing rule change its configured action and keeps it when observation is turned off', async () => {
    const user = userEvent.setup();
    function ConfigEditor() {
      const [config, setConfig] = useState(makeConfig({
        mailfrom_invalid: item({ action: 'reject' }),
      }));
      return <FormatChecksSection config={config} onChange={setConfig} />;
    }
    render(wrap(<ConfigEditor />));
    const action = screen.getByTestId('auth-format-action-mailfrom_invalid');
    await user.click(screen.getByTestId('auth-format-observe-mailfrom_invalid'));
    expect(action).toHaveTextContent('拒收');
    expect(action).toBeEnabled();
    await user.click(action);
    await user.click(screen.getByTestId('auth-spoofing-format-action-quarantine'));
    expect(action).toHaveTextContent('隔离');
    expect(screen.getByTestId('auth-format-observing-mailfrom_invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-format-highrisk-mailfrom_invalid')).toBeNull();
    await user.click(screen.getByTestId('auth-format-observe-mailfrom_invalid'));
    expect(action).toHaveTextContent('隔离');
    expect(screen.queryByTestId('auth-format-observing-mailfrom_invalid')).toBeNull();
  });

  it('keeps the proceed marking configuration visible while observing and respects read-only permissions', () => {
    const config = makeConfig({
      mailfrom_invalid: item({ action: 'proceed', observe_mode: true }),
    });
    render(wrap(<FormatChecksSection config={config} onChange={() => {}} disabled />));
    const card = within(screen.getByTestId('auth-format-card-mailfrom_invalid'));
    expect(card.getByTestId('auth-format-action-mailfrom_invalid')).toHaveTextContent('进行下一步');
    expect(card.getByTestId('auth-format-action-mailfrom_invalid')).toBeDisabled();
    expect(card.getByTestId('auth-spoofing-tag-panel')).toBeInTheDocument();
    expect(card.getByTestId('auth-spoofing-tag-subject-enabled')).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the persistent description text for each check item', () => {
    const config = makeConfig();
    render(wrap(<FormatChecksSection config={config} onChange={() => {}} />));
    expect(screen.getByText(/检查SMTP信封发信人是否为空/)).toBeInTheDocument();
    expect(screen.getByText(/检查发信人地址格式是否符合RFC标准/)).toBeInTheDocument();
    expect(screen.getByText(/检查邮件头中的From发信人与SMTP信封Mail From是否一致/)).toBeInTheDocument();
  });
});
