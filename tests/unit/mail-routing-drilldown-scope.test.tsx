import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// GT-12330 regression. When a platform admin (system_admin, viewer=platform)
// drills into a tenant's routing, the global selectedTenant is deliberately
// null — the platform-view reconciliation (GT-12245) clears it. The drill-down
// must therefore scope X-Tenant-ID from the EXPLICIT tenant id, not the global
// selected tenant. Before the fix RoutingDetail used useApiRequest() (global),
// so with selectedTenantId=null no X-Tenant-ID header was sent and every
// tenant-scoped mail-routing route returned 400.

// Global tenant is cleared (the reconciled state) — the header must NOT come
// from here.
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: null,
    user: { role: 'system_admin' },
  }),
}));

// Keep the test focused on RoutingDetail's own request scoping — the tab tree
// is exercised by its own tests.
vi.mock('@/components/mail-routing/mail-routing-shell', () => ({
  MailRoutingShell: () => null,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { RoutingDetail } from '@/components/tenants/routing/routing-detail';
import type { Tenant } from '@/types/tenant';

const TENANT_ID = 7;

const tenant = {
  id: TENANT_ID,
  name: 'Acme',
  code: 'acme',
  access_status: 'configured',
  routing_progress: { receiving: false, relay: false, outbound: false, auth: false },
} as unknown as Tenant;

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('RoutingDetail drill-down scope (GT-12330 regression)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ receiving: false, relay: false, outbound: false, auth: false }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends X-Tenant-ID from the explicit tenant id even when global selectedTenant is null', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(RoutingDetail, { tenant, onBack: () => {} }), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes(`/tenants/${TENANT_ID}/routing`),
      );
      expect(call, 'expected a fetch to /tenants/7/routing').toBeTruthy();
    });

    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes(`/tenants/${TENANT_ID}/routing`),
    )!;
    const headers = (call[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Tenant-ID']).toBe(String(TENANT_ID));
  });
});
