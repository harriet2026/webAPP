import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProtocolChecksSection } from './ProtocolChecksSection';
import type { ProtocolChecksConfig, CheckItem } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as any}>
    {ui}
  </NextIntlClientProvider>
);

const item = (action: CheckItem['action'], enabled = true): CheckItem => ({
  enabled,
  action,
  observe_mode: false,
});

function makeConfig(overrides: Partial<ProtocolChecksConfig> = {}): ProtocolChecksConfig {
  return {
    template: 'standard',
    observe_mode: false,
    spf: {
      fail: item('reject'),
      softfail: item('quarantine'),
      none: item('audit'),
      temperror: item('audit'),
    },
    dkim: {
      fail: item('quarantine'),
      neutral: item('quarantine'),
      partial: item('accept', false),
      none: item('audit'),
    },
    dmarc: {
      reject: item('reject'),
      quarantine: item('quarantine'),
      none: item('audit'),
    },
    ptr: {
      noptr: item('audit'),
      nomatch: item('quarantine'),
      ehlo_mismatch: item('quarantine'),
    },
    ...overrides,
  };
}

describe('ProtocolChecksSection', () => {
  it('disables the protocol action Select when template !== custom', () => {
    const config = makeConfig({ template: 'standard' });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    const combo = screen.getAllByRole('combobox')[0];
    expect(combo).toBeDisabled();
  });

  it('enables the protocol action Select when template === custom', () => {
    const config = makeConfig({ template: 'custom' });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    const combo = screen.getAllByRole('combobox')[0];
    expect(combo).not.toBeDisabled();
  });

  it('custom template button is clickable and, once confirmed, switches to custom (unlocks the Selects)', async () => {
    const config = makeConfig({ template: 'standard' });
    const onChange = vi.fn();
    render(wrap(<ProtocolChecksSection config={config} onChange={onChange} />));
    // the "自定义" (custom) template button must NOT be disabled
    const customBtn = screen.getByRole('button', { name: '自定义' });
    expect(customBtn).not.toBeDisabled();
    customBtn.click();
    // confirm dialog → click "应用" (templateApply)
    const applyBtn = await screen.findByText('应用');
    applyBtn.click();
    // onChange must transition to custom WITHOUT batch-filling (values preserved)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'custom', spf: config.spf }),
    );
  });

  it('shows wouldDropCount text and a pulse badge when observe_mode is true', () => {
    const config = makeConfig({ observe_mode: true });
    const { container } = render(
      wrap(<ProtocolChecksSection config={config} onChange={() => {}} wouldDrop={7} />),
    );
    expect(screen.getByText(/预计丢弃/)).toBeInTheDocument();
    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('does not show wouldDropCount text when observe_mode is false', () => {
    const config = makeConfig({ observe_mode: false });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} wouldDrop={7} />));
    expect(screen.queryByText(/预计丢弃/)).toBeNull();
  });

  it('does not render a per-row observe switch in protocol checks (hideObserve)', () => {
    const config = makeConfig();
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    // Only the global observe Switch should exist as a "switch" role, plus one
    // enable/disable Switch per visible row in the active (spf) tab. None of
    // those extra switches should carry the "observing" badge text.
    expect(screen.queryByText('观察中')).toBeNull();
  });

  it('calls onChange with observe_mode toggled via the global observe switch', () => {
    const config = makeConfig({ observe_mode: false });
    const onChange = vi.fn();
    render(wrap(<ProtocolChecksSection config={config} onChange={onChange} />));
    const globalSwitch = screen.getAllByRole('switch')[0];
    globalSwitch.click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ observe_mode: true }));
  });

  it('shows the SPF drop alert when spf.fail.action is discard', () => {
    const config = makeConfig({
      spf: {
        fail: item('discard'),
        softfail: item('quarantine'),
        none: item('audit'),
        temperror: item('audit'),
      },
    });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    expect(screen.getByText('SPF 硬拒绝设为静默丢弃，可能误删合法邮件')).toBeInTheDocument();
  });

  it('does not show the SPF drop alert when spf.fail.action is not discard', () => {
    const config = makeConfig();
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    expect(screen.queryByText('SPF 硬拒绝设为静默丢弃，可能误删合法邮件')).toBeNull();
  });
});
