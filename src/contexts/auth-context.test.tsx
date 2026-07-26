import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { Role } from '@/lib/api/roles';

/**
 * Plan C Task 2 — auth-context must carry role_id/is_super_admin from the
 * login/completeLogin LoginResponse into its `user` state (snake_case on the
 * wire, per internal/models.LoginResponse.RoleID/IsSuperAdmin), so Task 5's
 * permissionMatrix/hasPermission derivation has them to read later.
 *
 * Mirrors the mocking setup of tests/unit/auth-context-cache-reset.test.tsx.
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
const completeLoginFromResponseMock = vi.fn();

vi.mock('@/lib/api/auth', () => ({
  login: (...args: unknown[]) => apiLogin(...args),
  logout: (...args: unknown[]) => apiLogout(...args),
  completeLoginFromResponse: (...args: unknown[]) => completeLoginFromResponseMock(...args),
}));

// Task 5 (Plan C): the permission source. auth-context's PermissionResolver
// calls useMyRole() (Task 2's roles.ts) to fetch the caller's own role
// matrix; mock it so each test controls exactly what the "fetched role"
// looks like without a real network/react-query round trip.
const useMyRoleMock = vi.fn();
vi.mock('@/lib/api/roles', () => ({
  useMyRole: () => useMyRoleMock(),
}));

import { AuthProvider, useAuth } from '@/contexts/auth-context';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(AuthProvider, null, children),
  );
}

function Harness() {
  const { user, login, completeLogin } = useAuth();
  return createElement('div', null, [
    createElement(
      'button',
      {
        key: 'login',
        'data-testid': 'login',
        onClick: () => void login({ username: 'admin', password: 'x' }),
      },
      'login',
    ),
    createElement(
      'button',
      {
        key: 'complete',
        'data-testid': 'complete',
        onClick: () =>
          completeLogin(
            {
              token: 't',
              // Fixed future timestamp — a component render body must stay
              // pure (no Date.now()/impure calls), even inside a closure
              // passed as a prop.
              expires_at: '2099-01-01T00:00:00.000Z',
              role: 'tenant_admin',
              tenant_id: 5,
              role_id: 9,
              is_super_admin: false,
            },
            'bob',
          ),
      },
      'complete',
    ),
    createElement('span', { key: 'role_id', 'data-testid': 'role-id' }, String(user?.role_id ?? '')),
    createElement('span', { key: 'super', 'data-testid': 'is-super' }, String(user?.is_super_admin ?? '')),
  ]);
}

function IdentityHarness() {
  const { user, isLoading, isTrueSuperAdmin } = useAuth();
  return createElement('div', null, [
    createElement('span', { key: 'loading', 'data-testid': 'identity-loading' }, String(isLoading)),
    createElement('span', { key: 'username', 'data-testid': 'identity-username' }, user?.username ?? ''),
    createElement('span', { key: 'super', 'data-testid': 'identity-super' }, String(isTrueSuperAdmin)),
  ]);
}

function renderIdentity(demoAuthBypassEnabled: boolean) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider demoAuthBypassEnabled={demoAuthBypassEnabled}>
        <IdentityHarness />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Plan C Task 2 — auth-context carries role_id/is_super_admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Task 5's PermissionResolver mounts unconditionally inside AuthProvider
    // and calls useMyRole() — give it a harmless default so these
    // role_id/is_super_admin-only assertions don't have to care about it.
    useMyRoleMock.mockReturnValue({ data: undefined });
  });

  it('login() populates user.role_id/is_super_admin from a super-admin response', async () => {
    apiLogin.mockResolvedValue({
      role: 'system_admin',
      tenant_id: null,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      role_id: 3,
      is_super_admin: true,
    });
    render(createElement(Harness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login').click();
    });

    expect(screen.getByTestId('role-id').textContent).toBe('3');
    expect(screen.getByTestId('is-super').textContent).toBe('true');
  });

  it('login() defaults role_id to null / is_super_admin to false for a legacy account (fields absent)', async () => {
    apiLogin.mockResolvedValue({
      role: 'tenant_admin',
      tenant_id: 5,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      // role_id / is_super_admin intentionally omitted — legacy/unassigned account.
    });
    render(createElement(Harness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login').click();
    });

    expect(screen.getByTestId('role-id').textContent).toBe('');
    expect(screen.getByTestId('is-super').textContent).toBe('false');
  });

  it('completeLogin() (post-2FA) populates user.role_id/is_super_admin from the response', async () => {
    render(createElement(Harness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('complete').click();
    });

    expect(screen.getByTestId('role-id').textContent).toBe('9');
    expect(screen.getByTestId('is-super').textContent).toBe('false');
  });
});

describe('demo authentication bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useMyRoleMock.mockReturnValue({ data: undefined });
  });

  it('injects a mock super administrator when the server enables the bypass', async () => {
    renderIdentity(true);

    await waitFor(() => {
      expect(screen.getByTestId('identity-loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('identity-username').textContent).toBe('demo-admin');
    expect(screen.getByTestId('identity-super').textContent).toBe('true');
  });

  it('keeps anonymous behavior when the server does not enable the bypass', async () => {
    renderIdentity(false);

    await waitFor(() => {
      expect(screen.getByTestId('identity-loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('identity-username').textContent).toBe('');
    expect(screen.getByTestId('identity-super').textContent).toBe('false');
  });

  it('preserves a stored authenticated user instead of replacing it with the demo user', async () => {
    localStorage.setItem('osgateway_user', JSON.stringify({
      id: 7,
      username: 'stored-admin',
      role: 'system_admin',
      tenant_id: null,
      role_id: null,
      is_super_admin: false,
      created_at: '',
      updated_at: '',
    }));
    renderIdentity(true);

    await waitFor(() => {
      expect(screen.getByTestId('identity-loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('identity-username').textContent).toBe('stored-admin');
    expect(screen.getByTestId('identity-super').textContent).toBe('false');
  });
});

/**
 * Plan C Task 5 (spec §7.6/A-11) — the permission SOURCE. Today a
 * `system_admin` role STRING (regardless of is_super_admin) got the full
 * `permissionMatrix.system_admin` set — a `platform_auditor` account
 * (role=system_admin, is_super_admin=false) inherited full god-mode UI. This
 * regresses that: for a non-super account, `hasPermission`/`canSeeRoute`/
 * `can` must be derived from the account's OWN role permission matrix
 * (fetched via `useMyRole()`), not the coarse role string. A true super
 * admin (`is_super_admin === true`) still gets everything.
 */
function buildRole(rows: Array<{ submoduleId: string; visible?: boolean; canView?: boolean }>): Role {
  return {
    id: 42,
    name: 'test-role',
    scope: 'platform',
    permissions: rows.map((r) => ({
      submoduleId: r.submoduleId,
      visible: r.visible ?? true,
      canView: r.canView ?? true,
      canEdit: false,
      canApprove: null,
      canDelete: null,
    })),
  };
}

function PermissionHarness() {
  const { completeLogin, hasPermission, isTrueSuperAdmin, canSeeRoute, can } = useAuth();
  return createElement('div', null, [
    createElement(
      'button',
      {
        key: 'login-super',
        'data-testid': 'login-super',
        onClick: () =>
          completeLogin(
            {
              token: 't',
              expires_at: '2099-01-01T00:00:00.000Z',
              role: 'system_admin',
              tenant_id: null,
              role_id: 1,
              is_super_admin: true,
            },
            'root',
          ),
      },
      'login-super',
    ),
    createElement(
      'button',
      {
        key: 'login-auditor',
        'data-testid': 'login-auditor',
        onClick: () =>
          completeLogin(
            {
              token: 't',
              expires_at: '2099-01-01T00:00:00.000Z',
              role: 'system_admin',
              tenant_id: null,
              role_id: 2,
              is_super_admin: false,
            },
            'auditor',
          ),
      },
      'login-auditor',
    ),
    createElement(
      'button',
      {
        key: 'login-tenant',
        'data-testid': 'login-tenant',
        onClick: () =>
          completeLogin(
            {
              token: 't',
              expires_at: '2099-01-01T00:00:00.000Z',
              role: 'tenant_admin',
              tenant_id: 7,
              role_id: 3,
              is_super_admin: false,
            },
            'tadmin',
          ),
      },
      'login-tenant',
    ),
    createElement('span', { key: 'is-true-super', 'data-testid': 'is-true-super' }, String(isTrueSuperAdmin)),
    createElement(
      'span',
      { key: 'can-monitor', 'data-testid': 'can-monitor' },
      String(can('monitor-dashboard', 'view')),
    ),
    createElement(
      'span',
      { key: 'can-see-monitoring-infra', 'data-testid': 'can-see-monitoring-infra' },
      String(canSeeRoute('/monitoring/infrastructure')),
    ),
    createElement(
      'span',
      { key: 'has-manage-users', 'data-testid': 'has-manage-users' },
      String(hasPermission('manage_users')),
    ),
    createElement(
      'span',
      { key: 'has-manage-tenants', 'data-testid': 'has-manage-tenants' },
      String(hasPermission('manage_tenants')),
    ),
    createElement(
      'span',
      { key: 'has-view-auth', 'data-testid': 'has-view-auth' },
      String(hasPermission('view_auth_attempts')),
    ),
    createElement(
      'span',
      { key: 'has-view-admin-audit', 'data-testid': 'has-view-admin-audit' },
      String(hasPermission('view_admin_audit_logs')),
    ),
    createElement(
      'span',
      { key: 'has-view-link', 'data-testid': 'has-view-link' },
      String(hasPermission('view_link_logs')),
    ),
    createElement(
      'span',
      { key: 'has-login-security', 'data-testid': 'has-login-security' },
      String(hasPermission('manage_login_security')),
    ),
  ]);
}

describe('Plan C Task 5 — permissions derive from the fetched role matrix, not the role string', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    completeLoginFromResponseMock.mockImplementation(() => {});
  });

  it('a true super admin gets every permission, regardless of what its own role matrix says', async () => {
    // Empty matrix on purpose: is_super_admin alone must be sufficient.
    useMyRoleMock.mockReturnValue({ data: buildRole([]) });
    render(createElement(PermissionHarness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login-super').click();
    });

    expect(screen.getByTestId('is-true-super').textContent).toBe('true');
    expect(screen.getByTestId('can-monitor').textContent).toBe('true');
    expect(screen.getByTestId('can-see-monitoring-infra').textContent).toBe('true');
    for (const id of [
      'has-manage-users',
      'has-manage-tenants',
      'has-view-auth',
      'has-view-admin-audit',
      'has-view-link',
      'has-login-security',
    ]) {
      expect(screen.getByTestId(id).textContent).toBe('true');
    }
  });

  it('A-11 regression: a non-super system_admin (platform auditor) whose role matrix grants only monitor-dashboard does NOT get god-mode', async () => {
    useMyRoleMock.mockReturnValue({
      data: buildRole([{ submoduleId: 'monitor-dashboard' }]),
    });
    render(createElement(PermissionHarness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login-auditor').click();
    });

    expect(screen.getByTestId('is-true-super').textContent).toBe('false');
    // Monitor-related capability granted by the role matrix: allowed.
    expect(screen.getByTestId('can-monitor').textContent).toBe('true');
    // Not in the granted matrix: denied. This is the god-mode fix — the OLD
    // permissionMatrix[state.user.role] lookup granted every one of these to
    // any system_admin string, auditor included.
    expect(screen.getByTestId('has-manage-users').textContent).toBe('false');
    expect(screen.getByTestId('has-manage-tenants').textContent).toBe('false');
    expect(screen.getByTestId('has-view-auth').textContent).toBe('false');
    expect(screen.getByTestId('has-view-admin-audit').textContent).toBe('false');
    expect(screen.getByTestId('has-view-link').textContent).toBe('false');
    expect(screen.getByTestId('has-login-security').textContent).toBe('false');
    expect(screen.getByTestId('can-see-monitoring-infra').textContent).toBe('false');
  });

  it('tenant_admin keeps its existing capability set when its role matrix grants the same submodules', async () => {
    useMyRoleMock.mockReturnValue({
      data: buildRole([
        { submoduleId: 'auth-logs' },
        { submoduleId: 'admin-logs' },
        { submoduleId: 'link-logs' },
        { submoduleId: 'login-security' },
      ]),
    });
    render(createElement(PermissionHarness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login-tenant').click();
    });

    expect(screen.getByTestId('is-true-super').textContent).toBe('false');
    expect(screen.getByTestId('has-view-auth').textContent).toBe('true');
    expect(screen.getByTestId('has-view-admin-audit').textContent).toBe('true');
    expect(screen.getByTestId('has-view-link').textContent).toBe('true');
    expect(screen.getByTestId('has-login-security').textContent).toBe('true');
    // A tenant_admin never held these under the old matrix either.
    expect(screen.getByTestId('has-manage-tenants').textContent).toBe('false');
    expect(screen.getByTestId('has-manage-users').textContent).toBe('false');
  });

  it('GT-12366/12370/12374: unconfigured tenant_admin sees 日志审计 menus via fallback (auth/link/admin logs) but not platform-only perms', async () => {
    // Empty matrix => hasConfiguredMatrix false => coarse tenant-admin fallback.
    useMyRoleMock.mockReturnValue({ data: buildRole([]) });
    render(createElement(PermissionHarness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login-tenant').click();
    });

    expect(screen.getByTestId('is-true-super').textContent).toBe('false');
    // The three log-audit menu permissions must be granted by the fallback.
    expect(screen.getByTestId('has-view-auth').textContent).toBe('true');
    expect(screen.getByTestId('has-view-admin-audit').textContent).toBe('true');
    expect(screen.getByTestId('has-view-link').textContent).toBe('true');
    // Platform-only capabilities must still be denied — the fallback must not overreach.
    expect(screen.getByTestId('has-manage-tenants').textContent).toBe('false');
    expect(screen.getByTestId('has-manage-users').textContent).toBe('false');
  });

  it('fails closed (denies, not grants) for an account whose role fetch has no data yet / no role assigned', async () => {
    useMyRoleMock.mockReturnValue({ data: undefined });
    render(createElement(PermissionHarness, {}), { wrapper });

    await act(async () => {
      screen.getByTestId('login-auditor').click();
    });

    expect(screen.getByTestId('is-true-super').textContent).toBe('false');
    expect(screen.getByTestId('can-monitor').textContent).toBe('false');
    expect(screen.getByTestId('has-manage-users').textContent).toBe('false');
    expect(screen.getByTestId('can-see-monitoring-infra').textContent).toBe('false');
  });
});
