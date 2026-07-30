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

// GT-12613 added a `useSearchParams()` read for deep-link params
// (dimension/direction/time_range); without this mock, next/navigation's real
// implementation has no app-router context in jsdom and returns null, so
// `sp.get(...)` throws. Mirrors the sibling statistics-page specs
// (security-overview-print-scope, users-page-alignment).
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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

  it('uses the standard page shell and header without the legacy framed wrapper', () => {
    const { container } = renderPage();

    const shell = container.querySelector('[data-slot="page-shell"]');
    const header = container.querySelector('[data-slot="page-header"]');

    expect(shell).not.toBeNull();
    expect(header).not.toBeNull();
    expect(shell?.firstElementChild).toBe(header);
    expect(header?.querySelector('svg')).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll('div')).some((element) =>
        element.classList.contains('-m-8'),
      ),
    ).toBe(false);
    expect(
      Array.from(container.querySelectorAll('div')).some((element) =>
        element.classList.contains('space-y-6') && element.classList.contains('p-6'),
      ),
    ).toBe(false);
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
