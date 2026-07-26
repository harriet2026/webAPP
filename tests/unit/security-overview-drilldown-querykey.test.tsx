import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { DrillDownParams } from '@/lib/api/security-overview';

// Captured request paths per call so we can assert which URL each query
// invocation hit. The mock records every call's path argument.
const capturedPaths: string[] = [];

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, selectedTenantId: null, user: { role: 'system_admin' } }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({
    capabilities: { multiTenant: true },
    viewer: 'platform' as const,
  }),
}));

vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({
    apiRequest: (path: string) => {
      capturedPaths.push(path);
      return Promise.resolve({ items: [], filter_query: '' } as never);
    },
  }),
}));

import { useDrillDown } from '@/components/statistics/security-overview/hooks/useSecurityOverview';

const baseParams = (direction: DrillDownParams['direction']): DrillDownParams => ({
  date: '2026-06-03',
  viewBy: 'action',
  series: 'block',
  dimension: 'sender_domain',
  direction,
  limit: 10,
});

function makeWrapper(qc: QueryClient) {
  return function SecurityOverviewTestWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useDrillDown queryKey (BUG-1 regression)', () => {
  beforeEach(() => {
    capturedPaths.length = 0;
  });

  it('refetches when direction changes (no stale cross-direction cache hit)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const wrapper = makeWrapper(qc);

    const { rerender, unmount } = renderHook(
      ({ p }: { p: DrillDownParams }) => useDrillDown(p, null),
      { wrapper, initialProps: { p: baseParams('receive') } },
    );

    await waitFor(() => expect(capturedPaths.some((u) => u.includes('direction=receive'))).toBe(true));

    // Switch direction within staleTime; a correct queryKey must trigger a new
    // request with the updated direction.
    rerender({ p: baseParams('send') });

    await waitFor(() => expect(capturedPaths.some((u) => u.includes('direction=send'))).toBe(true));

    // Sanity: both directions were actually requested.
    expect(capturedPaths.some((u) => u.includes('direction=receive'))).toBe(true);
    expect(capturedPaths.some((u) => u.includes('direction=send'))).toBe(true);

    unmount();
  });

  it('refetches when limit changes', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const wrapper = makeWrapper(qc);

    const { rerender, unmount } = renderHook(
      ({ p }: { p: DrillDownParams }) => useDrillDown(p, null),
      { wrapper, initialProps: { p: baseParams('receive') } },
    );

    await waitFor(() => expect(capturedPaths.some((u) => u.includes('limit=10'))).toBe(true));

    rerender({ p: { ...baseParams('receive'), limit: 25 } });

    await waitFor(() => expect(capturedPaths.some((u) => u.includes('limit=25'))).toBe(true));

    unmount();
  });
});
