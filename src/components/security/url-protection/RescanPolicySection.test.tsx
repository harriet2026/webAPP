import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, string | number>) => {
    if (params && Object.keys(params).length > 0) {
      return `${namespace}.${key}:${JSON.stringify(params)}`;
    }
    return `${namespace}.${key}`;
  },
}));

const productFormState = { capabilities: { ai: true, multiTenant: true, saas: false } };
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => productFormState,
}));

import { RescanPolicySection } from './RescanPolicySection';
import type { URLProtectionSettings } from '@/types/url-protection';

const base: URLProtectionSettings = {
  public_base_url: 'https://gw.example-tenant.com',
  sandbox_config: null,
  rescan_blacklist: true,
  rescan_query_intel: true,
  rescan_deep_inspect: false,
  deep_inspect_timeout_sec: 60,
  deep_inspect_timeout_policy: 'block',
  allow_user_skip_deep_inspect: false,
};

describe('RescanPolicySection', () => {
  it('M3 关闭时不展开超时上限/兜底策略/允许跳过', () => {
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    render(<RescanPolicySection settings={base} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('deep-inspect-timeout')).toBeNull();
    expect(screen.queryByLabelText('deep-inspect-timeout-policy')).toBeNull();
    expect(screen.queryByLabelText('allow-user-skip')).toBeNull();
  });

  it('M3 开启时展开超时上限、兜底策略下拉与琥珀色耗时告知条', () => {
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    render(<RescanPolicySection settings={{ ...base, rescan_deep_inspect: true }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('deep-inspect-timeout')).toBeTruthy();
    expect(screen.getByLabelText('deep-inspect-timeout-policy')).toBeTruthy();
    expect(screen.getByTestId('deep-inspect-cost-banner')).toBeTruthy();
  });

  it('允许跳过开启时追加红色风险告知条', () => {
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    render(
      <RescanPolicySection
        settings={{ ...base, rescan_deep_inspect: true, allow_user_skip_deep_inspect: true }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('allow-skip-risk-banner')).toBeTruthy();
  });

  it('耗时文案随 deep_inspect_timeout_sec 变化（引擎名插值）', () => {
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    render(
      <RescanPolicySection
        settings={{ ...base, rescan_deep_inspect: true, deep_inspect_timeout_sec: 120 }}
        onChange={vi.fn()}
      />,
    );
    // costBanner 是 {engine} 插值 key；引擎名 = engineAi（AI 形态）
    expect(screen.getByTestId('deep-inspect-cost-banner').textContent).toContain('engineAi');
  });

  it('超时上限非法值不写入草稿并回弹到上次合法值', () => {
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    const onChange = vi.fn();
    render(
      <RescanPolicySection
        settings={{ ...base, rescan_deep_inspect: true, deep_inspect_timeout_sec: 60 }}
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId('deep-inspect-timeout-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    expect(input.value).toBe('60');
    expect(screen.getByTestId('deep-inspect-timeout-error')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('capabilities.ai=false 时 M3 仍渲染（demo 双形态），引擎徽章为 URL 沙箱', () => {
    productFormState.capabilities = { ai: false, multiTenant: false, saas: false };
    render(<RescanPolicySection settings={base} onChange={vi.fn()} />);
    expect(screen.getByLabelText('rescan-deep-inspect')).toBeTruthy();
    expect(screen.getByLabelText('rescan-blacklist')).toBeTruthy();
    expect(screen.getByLabelText('rescan-query-intel')).toBeTruthy();
    // 徽章文案 = engineLegacy key
    expect(screen.getAllByText('urlProtection.rescan.engineLegacy').length).toBeGreaterThan(0);
  });
});
