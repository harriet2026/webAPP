import { createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/contexts/auth-context';
import { ProductFormProvider } from '@/contexts/product-form-context';
import { agentCenterOverviewQueryKey, useAgentCenterOverview } from '@/hooks/use-agent-center-overview';
import { getAgentCenterOverview } from '@/lib/api/agent-center';

type AuthContextValue = ComponentProps<typeof AuthContext.Provider>['value'];
const TestProductFormProvider = ProductFormProvider as ComponentType<{
  switcherEnabled?: boolean;
}>;

let effectiveTenantId = 7;
let switcherEnabled = true;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function createAuthContextValue(): AuthContextValue {
  return {
    user: {
      id: 1,
      username: 'admin',
      role: 'system_admin',
      tenant_id: null,
      role_id: null,
      is_super_admin: true,
      created_at: '',
      updated_at: '',
    },
    token: null,
    expiresAt: null,
    selectedTenantId: effectiveTenantId,
    isLoading: false,
    demoAuthBypassEnabled: false,
    showAdvancedRules: false,
    features: { aiInterpret: false },
    login: vi.fn(),
    completeLogin: vi.fn(),
    logout: vi.fn(),
    startDemoSession: vi.fn(),
    setSelectedTenant: vi.fn(),
    hasPermission: vi.fn(() => true),
    isSystemAdmin: true,
    isTenantAdmin: false,
    isTrueSuperAdmin: true,
    canSeeRoute: vi.fn(() => true),
    can: vi.fn(() => true),
  };
}

function createWrapper(queryClient: QueryClient) {
  return function TestProviders({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        AuthContext.Provider,
        { value: createAuthContextValue() },
        createElement(TestProductFormProvider, { switcherEnabled }, children),
      ),
    );
  };
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  effectiveTenantId = 7;
  switcherEnabled = true;
  localStorage.setItem('osgateway_demo_session', '1');
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  localStorage.removeItem('osgateway_demo_session');
  vi.unstubAllGlobals();
});

describe('getAgentCenterOverview', () => {
  it('preserves the full request by default and opts out of statistics explicitly', async () => {
    const apiRequest = vi.fn(async (path: string) => path as never);

    await getAgentCenterOverview(apiRequest);
    await getAgentCenterOverview(apiRequest, { includeStats: false });

    expect(apiRequest.mock.calls).toEqual([
      ['/agent-center/overview'],
      ['/agent-center/overview?include_stats=false'],
    ]);
  });
});

describe('agentCenterOverviewQueryKey', () => {
  it('separates lightweight and full responses while preserving the full default', () => {
    expect(agentCenterOverviewQueryKey(7, false)).not.toEqual(agentCenterOverviewQueryKey(7, true));
    expect(agentCenterOverviewQueryKey(7)).toEqual(agentCenterOverviewQueryKey(7, true));
    expect(agentCenterOverviewQueryKey(7, true)).not.toEqual(agentCenterOverviewQueryKey(8, true));
  });
});

describe('useAgentCenterOverview', () => {
  it('does not request the overview when its caller disables the query', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useAgentCenterOverview({ includeStats: false, enabled: false }),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the lightweight request and tenant-scoped cache entry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ agents: [] }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useAgentCenterOverview({ includeStats: false }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agent-center/overview?include_stats=false',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Tenant-ID': '7' }),
      }),
    );
    expect(queryClient.getQueryData(agentCenterOverviewQueryKey(7, false))).toEqual({ agents: [] });
  });

  it('changes cache scope and requests a fresh overview when the effective tenant changes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ agents: [] }))
      .mockResolvedValueOnce(jsonResponse({ agents: [] }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender, result } = renderHook(
      () => useAgentCenterOverview({ includeStats: false }),
      { wrapper: createWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    effectiveTenantId = 8;
    rerender();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryState(agentCenterOverviewQueryKey(7, false))).toBeDefined();
    expect(queryClient.getQueryState(agentCenterOverviewQueryKey(8, false))).toBeDefined();
  });

  it('applies the shared product-form suppression before consumers see agents', async () => {
    switcherEnabled = false;
    fetchMock.mockResolvedValueOnce(jsonResponse({
      agents: [
        { key: 'phishing' },
        { key: 'spoofing' },
        { key: 'threat-retro' },
      ],
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useAgentCenterOverview({ includeStats: false }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.agents.map((agent) => agent.key)).toEqual(['phishing']);
  });
});
