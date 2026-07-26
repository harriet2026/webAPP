import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// GT-12427: 「处置设置」多租户下为租户自有配置。平台管理员在平台视角(未下钻到具体
// 租户,effectiveTenantId===null)访问本页 —— 例如手贴 URL 绕过被隐藏的侧栏入口 ——
// 必须拒绝渲染表单并显示 403,与同区兄弟模块 group-policy 一致。下钻进入某租户后
// (effectiveTenantId 非空)按该租户身份正常渲染表单;租户管理员/单租户形态同样渲染。

const tenantState = { effectiveTenantId: null as number | null };
const productFormState = { capabilities: { ai: true, multiTenant: true, saas: false } as { ai: boolean; multiTenant: boolean; saas: boolean } | null };
const authState = { isSystemAdmin: true };

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => tenantState,
}));
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => productFormState,
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
// The disposal-settings API must never be hit while the page is in the 403
// state — the query is disabled via `enabled: !platformWithoutTenant`.
const getDisposalSettings = vi.fn().mockResolvedValue({
  ...({} as Record<string, unknown>),
  server_tz: 'Asia/Shanghai',
});
vi.mock('@/lib/api/disposal-settings', () => ({
  getDisposalSettings: (...args: unknown[]) => getDisposalSettings(...args),
  putDisposalSettings: vi.fn(),
}));
// The three tabs pull in heavy sub-trees; stub them so this test focuses on the
// page-level access gate, not tab internals (covered by their own tests).
vi.mock('./quarantine-settings-tab', () => ({
  QuarantineSettingsTab: () => <div data-testid="stub-quarantine-tab" />,
}));
vi.mock('./review-settings-tab', () => ({
  ReviewSettingsTab: () => <div data-testid="stub-review-tab" />,
}));
vi.mock('./recall-settings-tab', () => ({
  RecallSettingsTab: () => <div data-testid="stub-recall-tab" />,
}));

import { DisposalSettingsPage } from './disposal-settings-page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DisposalSettingsPage />
    </QueryClientProvider>,
  );
}

describe('DisposalSettingsPage tenant-scope access gate (GT-12427)', () => {
  beforeEach(() => {
    getDisposalSettings.mockClear();
    tenantState.effectiveTenantId = null;
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    authState.isSystemAdmin = true;
  });

  it('platform admin without a drilled-in tenant sees 403, not the settings form', async () => {
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tenant-required')).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tabs')).not.toBeInTheDocument();
    // The query must be disabled in this state — no fetch fired.
    expect(getDisposalSettings).not.toHaveBeenCalled();
  });

  it('platform admin drilled into a tenant renders the settings form', async () => {
    tenantState.effectiveTenantId = 485;
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tenant-required')).not.toBeInTheDocument();
    expect(getDisposalSettings).toHaveBeenCalled();
  });

  it('tenant admin (not system admin) renders the settings form', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tenant-required')).not.toBeInTheDocument();
  });

  it('single-tenant form renders the form for platform admin (no tenant gate)', async () => {
    productFormState.capabilities = { ai: true, multiTenant: false, saas: false };
    tenantState.effectiveTenantId = null;
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tenant-required')).not.toBeInTheDocument();
  });
});
