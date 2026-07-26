import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('./RescanPolicySection', () => ({
  RescanPolicySection: () => <div data-testid="rescan-policy-section" />,
}));

import { LinkProtectionTab } from './LinkProtectionTab';
import type { URLProtectionSettings } from '@/types/url-protection';

const settings: URLProtectionSettings = {
  public_base_url: 'https://gw.example-tenant.com',
  sandbox_config: null,
  rescan_blacklist: true,
  rescan_query_intel: true,
  rescan_deep_inspect: false,
  deep_inspect_timeout_sec: 60,
  deep_inspect_timeout_policy: 'block',
  allow_user_skip_deep_inspect: false,
};

describe('LinkProtectionTab', () => {
  it('接收方向不再渲染独立链接保护开关，配置由统一总开关承载', () => {
    render(<LinkProtectionTab direction="receive" settings={settings} onPatch={vi.fn()} />);

    expect(screen.queryByLabelText('link-protection-toggle')).toBeNull();
    expect(screen.queryByTestId('link-protection-toggle-card')).toBeNull();
    expect(screen.getByTestId('link-protection-fixed-policy')).toBeTruthy();
    expect(screen.getByTestId('rescan-policy-section')).toBeTruthy();
    expect(screen.getByTestId('link-protection-zone').className).not.toContain('pointer-events-none');
  });

  it('非接收方向也不再显示已废弃的开关占位卡', () => {
    render(<LinkProtectionTab direction="send" settings={settings} onPatch={vi.fn()} />);

    expect(screen.queryByTestId('link-protection-non-receive-toggle-card')).toBeNull();
    expect(screen.getByTestId('link-protection-non-receive-policy-card')).toBeTruthy();
  });

  // GT-12223：链接保护的 toggleTip 说明提示原挂在 Tab 内开关上，开关随统一总开关
  // 移除后提示一并丢失。现以字段标签形式补回，trigger 存在即证明提示已挂回。
  it('接收方向渲染链接保护说明提示（toggleTip）字段标签', () => {
    render(<LinkProtectionTab direction="receive" settings={settings} onPatch={vi.fn()} />);

    const trigger = screen.getByTestId('link-protection-toggle-tooltip-trigger');
    expect(trigger).toBeTruthy();
    // 标签文本取自 linkProtection.toggle（mock 返回 namespace.key）。
    expect(trigger.textContent).toBe('urlProtection.linkProtection.toggle');
  });
});
