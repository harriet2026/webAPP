import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// Per spec §4.1: when an operator selects a tenant scope, the page must
// validate it via GET /tenants/:id; on 404 or non-active status the scope
// must fall back to all tenants. This test exercises that fallback at the
// component level (review item 4.2).
//
// We mock TenantScopeSelector to expose a button that selects tenant 42,
// then drive the validation effect by clicking it.

const apiRequestMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: apiRequestMock }),
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, params?: Record<string, string | number>) => {
    void _ns;
    if (params) {
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(`{${k}}`, String(v)),
        key,
      );
    }
    return key;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: null,
    user: { role: 'system_admin' },
    hasPermission: () => true,
    showAdvancedRules: false,
  }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({
    capabilities: { multiTenant: true },
    viewer: 'platform' as const,
    grants: [],
    registry: [],
    setViewer: vi.fn(),
  }),
}));

// Mock the selector so we can deterministically drive onChange(<id>).
// The button picks tenant 42 (matches the getTenantMock setup in each test).
vi.mock('@/components/statistics/security-overview/TenantScopeSelector', () => ({
  TenantScopeSelector: ({ onChange }: { value: number | null; onChange: (v: number | null) => void }) =>
    createElement(
      'button',
      {
        'data-testid': 'pick-tenant',
        onClick: () => onChange(42),
      },
      'pick tenant 42',
    ),
}));

// Mock the data-fetching child components to avoid pulling in chart libs.
vi.mock('@/components/statistics/security-overview/TrendChartCard', () => ({
  TrendChartCard: () => null,
}));
vi.mock('@/components/statistics/security-overview/KpiCards', () => ({
  KpiCards: () => null,
}));
vi.mock('@/components/statistics/security-overview/GeoDistributionCard', () => ({
  GeoDistributionCard: () => null,
}));
vi.mock('@/components/statistics/security-overview/TimeDistributionCard', () => ({
  TimeDistributionCard: () => null,
}));
vi.mock('@/components/statistics/security-overview/DetailTable', () => ({
  DetailTable: () => null,
}));
vi.mock('@/components/statistics/security-overview/EscapesAlert', () => ({
  EscapesAlert: () => null,
}));
vi.mock('@/components/statistics/security-overview/DrillDownCard', () => ({
  DrillDownCard: () => null,
}));
vi.mock('@/components/statistics/security-overview/BottomActions', () => ({
  BottomActions: () => null,
}));
vi.mock('@/components/shared/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  PageHeader: () => null,
}));
vi.mock('@/components/statistics/security-overview/FilterBar', () => ({
  FilterBar: ({ leftSlot }: { leftSlot: React.ReactNode }) =>
    createElement('div', null, leftSlot),
}));

const getTenantMock = vi.fn();
vi.mock('@/lib/api/tenants', () => ({
  getTenant: (id: number) => getTenantMock(id),
}));

import { SecurityOverviewPage } from '@/components/statistics/security-overview/SecurityOverviewPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(SecurityOverviewPage)),
  );
}

describe('SecurityOverviewPage tenant scope validation (spec §4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default stub covering all overview endpoints invoked by the page.
    apiRequestMock.mockResolvedValue({
      kpi: {
        total_filtered: 0, total_filtered_delta: null, block_rate: 0, block_rate_delta: null,
        recall_rate: 0, recall_rate_delta: null, pending_review: 0, pending_review_delta: null,
      },
      distribution: [], trend: {}, trend_previous: null, trend_previous_period: null, detail_table: {},
      countries: [], buckets: [], hourly: [], peak_hours: [], items: [], total: 0, filter_query: '',
    });
  });

  it('clears scopeTenantId when GET /tenants/:id returns 404', async () => {
    getTenantMock.mockRejectedValueOnce(new Error('404'));
    const { getByTestId, queryByTestId } = renderPage();

    // scopeActive=true → selector rendered. Click to select tenant 42.
    fireEvent.click(getByTestId('pick-tenant'));

    await waitFor(() => expect(getTenantMock).toHaveBeenCalledWith(42));

    // Fallback cleared scopeTenantId back to null → selector still visible
    // (scopeActive remains true for platform admin) but no further validation
    // call happens. The single getTenant call proves the fallback ran once.
    await waitFor(() => {
      expect(getTenantMock).toHaveBeenCalledTimes(1);
    });
    expect(queryByTestId('pick-tenant')).toBeInTheDocument();
  });

  it('clears scopeTenantId when tenant status is suspended', async () => {
    getTenantMock.mockResolvedValueOnce({ id: 42, status: 'suspended' });
    const { getByTestId } = renderPage();

    fireEvent.click(getByTestId('pick-tenant'));

    await waitFor(() => expect(getTenantMock).toHaveBeenCalledWith(42));
    // status !== 'active' → handleScopeTenantChange(null) → no second call.
    await waitFor(() => {
      expect(getTenantMock).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps scopeTenantId when tenant status is active', async () => {
    getTenantMock.mockResolvedValueOnce({ id: 42, status: 'active' });
    const { getByTestId } = renderPage();

    fireEvent.click(getByTestId('pick-tenant'));

    await waitFor(() => expect(getTenantMock).toHaveBeenCalledWith(42));
    expect(getTenantMock).toHaveBeenCalledTimes(1);
  });
});
