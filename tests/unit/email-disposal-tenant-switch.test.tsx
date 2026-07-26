import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// TEST-3 (review): switching the platform page's private tenant scope must
// clear the list selection and re-fetch under the new X-Tenant-ID without
// changing the global impersonation context.

const apiRequestMock = vi.fn();
const getDisposalListMock = vi.fn();
const useScopedApiRequestMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: (tenantId: number | null) => useScopedApiRequestMock(tenantId),
}));

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => {
    const translate = Object.assign(
      (key: string, params?: Record<string, string | number>) => {
        void _ns;
        if (params) {
          return Object.entries(params).reduce(
            (s, [k, v]) => s.replace(`{${k}}`, String(v)),
            key,
          );
        }
        return key;
      },
      { has: () => false },
    );
    return translate;
  },
  useLocale: () => 'zh',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const useTenantMock = vi.fn();
vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => useTenantMock(),
}));

const useProductFormMock = vi.fn();
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => useProductFormMock(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: null,
    user: { role: 'system_admin' },
    hasPermission: () => true,
    features: { aiInterpret: true },
  }),
}));

// Capture getDisposalList invocations so we can assert the tenant scope.
vi.mock('@/components/email-disposal/lib/disposal-api', () => ({
  getDisposalList: (...args: unknown[]) => getDisposalListMock(...(args as [unknown])),
  bulkDispose: vi.fn(),
  findSimilar: vi.fn(),
}));

vi.mock('@/components/shared/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  PageHeader: () => null,
  PageSurface: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  // 页面已改用 FramedPage 包裹（master 侧改动），mock 缺该导出会让本用例恒红。
  FramedPage: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/shared/page-filters', () => ({
  PageFilters: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/shared/server-pagination', () => ({
  ServerPagination: () => null,
}));
vi.mock('@/components/layout/tenant-selector', () => ({
  TenantSelector: ({ onChange }: { onChange?: (tenantId: number | null) => void }) =>
    createElement('button', { onClick: () => onChange?.(2) }, 'select tenant B'),
}));
// 09ee6b4cdd：结构化筛选（含平台租户选择器）折叠进「高级筛选」开关后面。展开开关在
// SearchBar 里、租户选择器作为 tenantSelector 传给 QuickFilters —— 两者都要在 mock 里
// 渲染出来，否则页面本地平台作用域切换无从触发。
vi.mock('@/components/email-disposal/search-bar', () => ({
  SearchBar: ({ onToggleFilters }: { onToggleFilters?: () => void }) =>
    createElement('button', { 'data-testid': 'disposal-filters-toggle', onClick: onToggleFilters }, 'toggle filters'),
}));
vi.mock('@/components/email-disposal/quick-filters', () => ({
  QuickFilters: ({ tenantSelector }: { tenantSelector?: import('react').ReactNode }) => tenantSelector ?? null,
}));
vi.mock('@/components/email-disposal/advanced-filters', () => ({
  AdvancedFilters: () => null,
}));
vi.mock('@/components/email-disposal/selected-conditions', () => ({
  SelectedConditions: () => null,
}));
vi.mock('@/components/email-disposal/detail-modal', () => ({
  DetailModal: () => null,
}));
vi.mock('@/components/email-disposal/similar-results-sheet', () => ({
  SimilarResultsSheet: () => null,
}));

import { EmailDisposalCenterPage } from '@/components/email-disposal/email-disposal-center-page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(EmailDisposalCenterPage)),
  );
}

function item(id: number) {
  return {
    id,
    sender: `s${id}@x.com`,
    recipients: [`r${id}@y.com`],
    subject: `subj ${id}`,
    action: 'quarantine',
    status: '',
    authenticated: false,
    received_at: '2026-01-01T00:00:00Z',
  };
}

describe('EmailDisposalCenterPage tenant-switch reset (review TEST-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductFormMock.mockReturnValue({
      capabilities: { multiTenant: true, ai: false },
      viewer: 'platform',
    });
    useScopedApiRequestMock.mockImplementation(() => ({ apiRequest: apiRequestMock }));
    apiRequestMock.mockResolvedValue({});
    getDisposalListMock.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  });

  it('re-fetches the list when the page-local platform scope changes', async () => {
    useTenantMock.mockReturnValue({ effectiveTenantId: null, selectedTenantId: null });
    getDisposalListMock.mockResolvedValueOnce({
      items: [item(1)], total: 1, page: 1, page_size: 20,
    });

    const { getByTestId, findByRole } = renderPage();

    await waitFor(() => expect(getDisposalListMock).toHaveBeenCalled());
    const firstCall = getDisposalListMock.mock.calls.length;

    // 09ee6b4cdd：结构化筛选（含平台租户选择器）默认折叠在「高级筛选」开关后面，
    // 先展开再选择租户 B。
    getByTestId('disposal-filters-toggle').click();
    (await findByRole('button', { name: 'select tenant B' })).click();

    await waitFor(() => {
      expect(getDisposalListMock.mock.calls.length).toBeGreaterThan(firstCall);
    });
    expect(useScopedApiRequestMock).toHaveBeenLastCalledWith(2);
  });
});
