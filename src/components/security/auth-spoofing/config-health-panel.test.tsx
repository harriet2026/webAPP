import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ConfigHealthPanel } from './ConfigHealthPanel';
import type { ProtocolChecksConfig, CheckItem } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) =>
  <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>{ui}</NextIntlClientProvider>;

const item = (action: CheckItem['action']): CheckItem => ({ enabled: true, action, observe_mode: false });

function makeConfig(overrides: Partial<ProtocolChecksConfig> = {}): ProtocolChecksConfig {
  return {
    template: 'standard',
    spf_observe_mode: true,
    dkim_observe_mode: true,
    dmarc_observe_mode: true,
    ptr_observe_mode: true,
    spf: { fail: item('reject'), softfail: item('audit') },
    dkim: { fail: item('reject') },
    dmarc: { reject: item('reject') },
    ptr: {},
    ...overrides,
  };
}

describe('ConfigHealthPanel', () => {
  it('renders only the title row when spf/dmarc observe_mode=false and no discard actions', () => {
    const config = makeConfig({ spf_observe_mode: false, dmarc_observe_mode: false });
    render(wrap(<ConfigHealthPanel config={config} onChange={() => {}} />));
    expect(screen.getByText('配置健康检查')).toBeTruthy();
    expect(screen.queryByText('改为隔离')).toBeNull();
    expect(screen.queryByText('改为标记')).toBeNull();
    expect(screen.queryByText('开启观察模式')).toBeNull();
  });

  it('shows softfail row with quick-fix buttons and fires onChange with the right action', () => {
    const config = makeConfig({
      spf_observe_mode: true,
      spf: { fail: item('reject'), softfail: item('discard') },
    });
    const onChange = vi.fn();
    render(wrap(<ConfigHealthPanel config={config} onChange={onChange} />));

    expect(screen.getByText('高风险：SPF软拒绝设置为丢弃')).toBeTruthy();

    fireEvent.click(screen.getByText('改为隔离'));
    expect(onChange).toHaveBeenCalledTimes(1);
    let next = onChange.mock.calls[0][0] as ProtocolChecksConfig;
    expect(next.spf.softfail.action).toBe('quarantine');
    expect(next).not.toBe(config);
    expect(next.spf).not.toBe(config.spf);

    onChange.mockClear();
    fireEvent.click(screen.getByText('改为标记'));
    expect(onChange).toHaveBeenCalledTimes(1);
    next = onChange.mock.calls[0][0] as ProtocolChecksConfig;
    // GT-12833：「改为标记」的落点从 audit 改为 proceed（标记放行）。
    expect(next.spf.softfail.action).toBe('proceed');
  });

  it('shows the observe-mode row and fires onChange (only spf_observe_mode) when spf.fail is discard', () => {
    const config = makeConfig({
      spf_observe_mode: false,
      spf: { fail: item('discard'), softfail: item('audit') },
    });
    const onChange = vi.fn();
    render(wrap(<ConfigHealthPanel config={config} onChange={onChange} />));

    expect(screen.getByText('当前配置包含"丢弃"动作，建议开启观察模式验证影响面')).toBeTruthy();
    fireEvent.click(screen.getByText('开启观察模式'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ProtocolChecksConfig;
    expect(next.spf_observe_mode).toBe(true);
    expect(next).not.toBe(config);
  });

  it('renders null when spf/dmarc observe_mode=true and no discard actions', () => {
    const config = makeConfig({ spf_observe_mode: true, dmarc_observe_mode: true });
    const { container } = render(wrap(<ConfigHealthPanel config={config} onChange={() => {}} />));
    expect(container.firstChild).toBeNull();
  });

  it('is resilient to missing subkeys', () => {
    const config = makeConfig({ spf_observe_mode: false, dmarc_observe_mode: false, spf: {}, dmarc: {} });
    render(wrap(<ConfigHealthPanel config={config} onChange={() => {}} />));
    expect(screen.getByText('配置健康检查')).toBeTruthy();
  });
});
