import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

/**
 * GT-12080 — the React Query cache must be dropped on every identity change.
 *
 * The QueryClient is created once at the root provider and outlives a logout
 * (which is a router.push, not a document load), while rule query keys carry no
 * tenant/user (e.g. ['sender-filter-rules']). Without an explicit reset the next
 * admin on the tab reads the previous one's rows straight from the cache — and
 * with the 60s staleTime React Query does not even refetch.
 *
 * The Playwright spec (tenant-cache-isolation.spec.ts) covers the logout ->
 * re-login flow end-to-end. These cases additionally pin the tenant-switch
 * transition, which no browser spec exercises.
 */

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const apiLogin = vi.fn();
const apiLogout = vi.fn();

vi.mock('@/lib/api/auth', () => ({
  login: (...args: unknown[]) => apiLogin(...args),
  logout: (...args: unknown[]) => apiLogout(...args),
  completeLoginFromResponse: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/contexts/auth-context';

const CACHED_KEY = ['sender-filter-rules'];
const TENANT_A_ROWS = { items: [{ id: 1, name: 'tenant-a-blacklist' }] };

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(AuthProvider, null, children),
  );
}

// Exposes the auth actions under test as buttons so they run inside React.
function Harness(props: { switchTo?: number }) {
  const switchTo = props.switchTo ?? 222;
  const { login, logout, setSelectedTenant } = useAuth();
  return createElement('div', null, [
    createElement(
      'button',
      {
        key: 'login',
        'data-testid': 'login',
        onClick: () => void login({ username: 'tenant-b-admin', password: 'x' }),
      },
      'login',
    ),
    createElement(
      'button',
      { key: 'logout', 'data-testid': 'logout', onClick: () => void logout() },
      'logout',
    ),
    createElement(
      'button',
      {
        key: 'switch',
        'data-testid': 'switch-tenant',
        onClick: () => setSelectedTenant(switchTo),
      },
      'switch',
    ),
  ]);
}

/** Seeds the cache the way tenant A's session would have left it. */
function seedPreviousIdentityCache() {
  queryClient.setQueryData(CACHED_KEY, TENANT_A_ROWS);
  expect(queryClient.getQueryData(CACHED_KEY)).toEqual(TENANT_A_ROWS);
}

describe('GT-12080 auth-context clears the query cache on identity change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60 * 1000 } },
    });
    apiLogin.mockResolvedValue({ role: 'tenant_admin', tenant_id: 222 });
    apiLogout.mockResolvedValue(undefined);
  });

  it('drops the previous identity rows on logout', async () => {
    render(createElement(Harness, {}), { wrapper });
    seedPreviousIdentityCache();

    await act(async () => {
      screen.getByTestId('logout').click();
    });

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined());
  });

  it('drops the previous identity rows on login', async () => {
    render(createElement(Harness, {}), { wrapper });
    // A session that ended without a clean logout (token expiry, tab restore)
    // still leaves the previous admin's rows behind; the next login must not
    // inherit them.
    seedPreviousIdentityCache();

    await act(async () => {
      screen.getByTestId('login').click();
    });

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined());
  });

  it('drops the previous tenant rows when a system_admin switches tenant', async () => {
    render(createElement(Harness, {}), { wrapper });
    // The selected tenant travels in the X-Tenant-ID header, not in the query
    // key, so without a reset the newly selected tenant renders the previous
    // tenant's rows.
    seedPreviousIdentityCache();

    await act(async () => {
      screen.getByTestId('switch-tenant').click();
    });

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined());
  });

  it('does NOT clear the cache when the tenant is re-asserted unchanged', async () => {
    // Guards an endless clear/refetch loop. Callers re-assert the CURRENT tenant
    // on mount — mail-routing/page.tsx does it from an effect fed by the
    // ['routing-scope'] query. If a no-op set cleared the cache it would evict
    // that query, which refetches, which re-fires the effect, which clears again.
    // A no-op set must stay a no-op.
    render(createElement(Harness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login').click();
    });
    // login() resolves to tenant 222, so the cache now belongs to tenant 222.
    queryClient.setQueryData(CACHED_KEY, TENANT_A_ROWS);

    await act(async () => {
      screen.getByTestId('switch-tenant').click(); // same tenant: 222
    });

    expect(queryClient.getQueryData(CACHED_KEY)).toEqual(TENANT_A_ROWS);
  });

  it('still clears when switching to a DIFFERENT tenant after login', async () => {
    render(createElement(Harness, { switchTo: 333 }), { wrapper });

    await act(async () => {
      screen.getByTestId('login').click(); // tenant 222
    });
    queryClient.setQueryData(CACHED_KEY, TENANT_A_ROWS);

    await act(async () => {
      screen.getByTestId('switch-tenant').click(); // -> tenant 333
    });

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined());
  });
});
