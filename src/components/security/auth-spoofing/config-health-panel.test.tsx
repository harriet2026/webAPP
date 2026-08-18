import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ConfigHealthPanel } from './ConfigHealthPanel';
import type { ProtocolChecksConfig, CheckItem } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';

const wrap = (ui: React.ReactNode) =>
  <NextIntlClientProvider locale="zh" messages={zh as any}>{ui}</NextIntlClientProvider>;

const item = (action: CheckItem['action']): CheckItem => ({ enabled: true, action, observe_mode: false });

function makeConfig(overrides: Partial<ProtocolChecksConfig> = {}): ProtocolChecksConfig {
  return {
    template: 'standard',
    observe_mode: true,
    spf: { fail: item('reject'), softfail: item('audit') },
    dkim: { fail: item('reject') },
    dmarc: { reject: item('reject') },
    ptr: {},
    ...overrides,
  };
}

describe('ConfigHealthPanel', () => {
  it('renders only the title row when observe_mode=false and no discard actions', () => {
    const config = makeConfig({ observe_mode: false });
    render(wrap(<ConfigHealthPanel config={config} onChange={() => {}} />));
    expect(screen.getByText('配置健康检查')).toBeTruthy();
    expect(screen.queryByText('改为隔离')).toBeNull();
    expect(screen.queryByText('改为标记')).toBeNull();
    expect(screen.queryByText('开启观察模式')).toBeNull();
  });

  it('shows softfail row with quick-fix buttons and fires onChange with the right action', () => {
    const config = makeConfig({
      observe_mode: true,
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
    // GT-12833：「改为标记」的落点从 audit 改为 mark-delivery（标记放行）。
    expect(next.spf.softfail.action).toBe('mark-delivery');
  });

  it('shows the observe-mode row and fires onChange when a discard action is present', () => {
    const config = makeConfig({
      observe_mode: false,
      spf: { fail: item('discard'), softfail: item('audit') },
    });
    const onChange = vi.fn();
    render(wrap(<ConfigHealthPanel config={config} onChange={onChange} />));

    expect(screen.getByText('当前配置包含"丢弃"动作，建议开启观察模式验证影响面')).toBeTruthy();
    fireEvent.click(screen.getByText('开启观察模式'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ProtocolChecksConfig;
    expect(next.observe_mode).toBe(true);
    expect(next).not.toBe(config);
  });

  it('renders null when observe_mode=true and no discard actions', () => {
    const config = makeConfig({ observe_mode: true });
    const { container } = render(wrap(<ConfigHealthPanel config={config} onChange={() => {}} />));
    expect(container.firstChild).toBeNull();
  });

  it('is resilient to missing subkeys', () => {
    const config = makeConfig({ observe_mode: false, spf: {}, dmarc: {} });
    render(wrap(<ConfigHealthPanel config={config} onChange={() => {}} />));
    expect(screen.getByText('配置健康检查')).toBeTruthy();
  });
});
