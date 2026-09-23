import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProtocolChecksSection } from './ProtocolChecksSection';
import type { ProtocolChecksConfig, CheckItem } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
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
      partial: item('proceed', false),
      none: item('audit'),
      permerror: item('proceed'),
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

  it('supports legacy observe while explicit protocol false takes precedence', () => {
    const config = makeConfig({ observe_mode: true, spf_observe_mode: false });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    expect(screen.getByTestId('protocol-observe-spf')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('tab', { name: 'DKIM' }));
    expect(screen.getByTestId('protocol-observe-dkim')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the product-approved concise description when switching to the loose template', async () => {
    const config = makeConfig({ template: 'standard' });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));

    fireEvent.click(screen.getByRole('button', { name: '宽松' }));

    expect(await screen.findByText('仅拦截明确伪造')).toBeInTheDocument();
    expect(screen.queryByText(/兼容老旧系统|丢弃动作使用极少/)).toBeNull();
  });

  it('shows wouldDropCount text and a pulse badge when the active protocol is observing', () => {
    const config = makeConfig({ observe_mode: false, spf_observe_mode: true });
    const { container } = render(
      wrap(
        <ProtocolChecksSection
          config={config}
          onChange={() => {}}
          wouldDropByProtocol={{ spf: 7, dkim: 0, dmarc: 0, ptr: 0 }}
        />,
      ),
    );
    expect(screen.getByText(/预计丢弃/)).toBeInTheDocument();
    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('does not show wouldDropCount text when the active protocol is not observing', () => {
    const config = makeConfig({ observe_mode: true, spf_observe_mode: false });
    render(
      wrap(
        <ProtocolChecksSection
          config={config}
          onChange={() => {}}
          wouldDropByProtocol={{ spf: 7, dkim: 0, dmarc: 0, ptr: 0 }}
        />,
      ),
    );
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

  it('toggles only the active protocol observation', () => {
    const config = makeConfig({ observe_mode: false });
    const onChange = vi.fn();
    render(wrap(<ProtocolChecksSection config={config} onChange={onChange} />));
    const globalSwitch = screen.getAllByRole('switch')[0];
    globalSwitch.click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ spf_observe_mode: true, observe_mode: false }));
  });

  it.each([true, false])('sets the active protocol observe flag to %s and preserves other protocols', (observe) => {
    const config = makeConfig({ observe_mode: !observe });
    for (const key of ['spf', 'dkim', 'dmarc', 'ptr'] as const) {
      for (const item of Object.values(config[key])) item.observe_mode = !observe;
    }
    const before = structuredClone(config);
    const onChange = vi.fn();
    render(wrap(<ProtocolChecksSection config={config} onChange={onChange} />));
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0] as ProtocolChecksConfig;
    expect(saved.spf_observe_mode).toBe(observe);
    expect(saved.observe_mode).toBe(!observe);
    for (const key of ['spf', 'dkim', 'dmarc', 'ptr'] as const) {
      for (const [name, item] of Object.entries(saved[key])) {
        expect(item).toEqual({ ...before[key][name], observe_mode: key === 'spf' ? observe : !observe });
      }
    }
    expect(config).toEqual(before);
  });

  it('keeps tenant PTR actions editable with the shared observe switch enabled', () => {
    const config = makeConfig({ template: 'custom', observe_mode: true });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    fireEvent.click(screen.getByRole('tab', { name: 'PTR' }));
    for (const key of ['noptr', 'nomatch', 'ehlo_mismatch']) {
      expect(screen.getByTestId(`protocol-check-action-ptr-${key}`)).not.toBeDisabled();
    }
    expect(screen.queryByText(/不受租户观察模式影响|联系系统管理员/)).toBeNull();
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

  it('shows DKIM permerror as proceed with optional marking controls', () => {
    const config = makeConfig({ template: 'custom' });
    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));

    fireEvent.click(screen.getByRole('tab', { name: 'DKIM' }));
    const row = screen.getByTestId('protocol-check-dkim-permerror');
    expect(within(row).getByText('DKIM 校验永久失败')).toBeInTheDocument();
    expect(within(row).getByTestId('protocol-check-action-dkim-permerror')).toHaveTextContent('进行下一步');
    expect(within(row).getByTestId('auth-spoofing-tag-panel')).toBeInTheDocument();
  });

  it('summarizes enabled actions and keeps the PTR action name visible', () => {
    const config = makeConfig({
      spf: {
        fail: item('discard', false),
        softfail: item('proceed'),
      },
      ptr: {
        noptr: item('quarantine'),
        nomatch: item('discard', false),
      },
    });

    render(wrap(<ProtocolChecksSection config={config} onChange={() => {}} />));
    expect(screen.getByTestId('auth-flow-summary-hint')).toHaveTextContent(
      '节点显示已启用规则中的最严格处置',
    );

    expect(screen.getByTestId('auth-flow-node-sub-spf')).toHaveTextContent('进行下一步');
    expect(screen.getByTestId('auth-flow-node-sub-ptr')).toHaveTextContent('隔离');
  });
});
