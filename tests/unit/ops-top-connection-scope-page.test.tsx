import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Captures every params object the page hands to useOpsTop, including the one
// from the FIRST render - that is exactly where the 403 used to escape.
const opsTopCalls: Array<{ dimension: string }> = [];

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => 'zh',
}));

vi.mock('@/components/statistics/ops-top-trend/hooks/useOpsTop', () => ({
  useOpsTop: (params: { dimension: string }) => {
    opsTopCalls.push({ dimension: params.dimension });
    return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

const authState = {
  features: { aiInterpret: true },
  isSystemAdmin: true,
  selectedTenantId: null as number | null,
};

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('@/lib/api/logs', () => ({ getTenantHeader: () => ({}) }));

import OpsTopTrendPage from '@/components/statistics/ops-top-trend/OpsTopTrendPage';

// The page's own data hook is mocked, but child widgets (tenant selector)
// still use react-query, so a provider is required.
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => [] } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OpsTopTrendPage />
    </QueryClientProvider>,
  );
}

describe('OpsTopTrendPage connection-dimension scope', () => {
  beforeEach(() => {
    opsTopCalls.length = 0;
  });

  // platform_auditor: role=system_admin but is_super_admin=false. The backend
  // serves it the connection dimension, so the tab must be visible and the
  // default dimension must stay connection.
  it('keeps connection for a non-super system_admin with no tenant selected', () => {
    authState.isSystemAdmin = true;
    authState.selectedTenantId = null;

    renderPage();

    expect(screen.getByTestId('ops-dim-connection')).toBeTruthy();
    expect(opsTopCalls.length).toBeGreaterThan(0);
    expect(opsTopCalls.every((c) => c.dimension === 'connection')).toBe(true);
  });

  it('never requests dimension=connection for a tenant-switched system_admin', () => {
    authState.isSystemAdmin = true;
    authState.selectedTenantId = 7;

    renderPage();

    expect(screen.queryByTestId('ops-dim-connection')).toBeNull();
    expect(opsTopCalls.length).toBeGreaterThan(0);
    expect(opsTopCalls.some((c) => c.dimension === 'connection')).toBe(false);
  });

  it('never requests dimension=connection for a tenant admin', () => {
    authState.isSystemAdmin = false;
    authState.selectedTenantId = 7;

    renderPage();

    expect(screen.queryByTestId('ops-dim-connection')).toBeNull();
    expect(opsTopCalls.some((c) => c.dimension === 'connection')).toBe(false);
  });
});
