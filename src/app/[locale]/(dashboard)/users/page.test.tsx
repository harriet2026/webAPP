import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import type { User } from '@/types/user';

// Task 9 (Plan B): account-tab status column/badge, force-offline, status
// toggle, batch bar, role_id Select, and tenant-scoped data source. These
// cover the NEW behaviors added on top of the existing create/edit/delete/
// reset/unlock account tab (Task 8 landed the API client this page calls).

const apiRequestMock = vi.fn();
// "impersonation drives tenant scope": effectiveTenantId is the real hook's
// resolved scope (selectedTenantId for a system_admin, the caller's own
// tenant_id for a tenant_admin — see lib/api/client.ts useApiRequest).
// Mutable so individual tests can simulate a system_admin who has selected a
// tenant via the global TenantSelector.
let mockEffectiveTenantId: number | null = null;
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: apiRequestMock, effectiveTenantId: mockEffectiveTenantId }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// `@/i18n/navigation`'s `Link` is next-intl's createNavigation() client, which
// pulls in the REAL `next/navigation` module internally — that resolution
// fails under Vitest's plain ESM resolver (next's package.json `exports` map
// does not list `./navigation`, so only Next's own bundler can resolve it).
// The tenant-filter `<Link>` on this page is not under test here; stub it out
// so importing the page module doesn't trip that unrelated resolution issue.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  // The users page now calls useRouter() (row action → router.push). The mock
  // must export it or the whole page render throws "No useRouter export".
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/admin/login-security/LoginSecurityTab', () => ({
  LoginSecurityTab: () => <div data-testid="login-security-tab-stub" />,
}));

// Plan C Task 7: the 角色权限 tab. Its own render/linkage behavior is covered
// by RoleDrawer.test.tsx in isolation — stub it here so this file only
// exercises the tab-gating wiring (mirrors the LoginSecurityTab stub above).
vi.mock('@/components/admin/rbac/RolePermissionTab', () => ({
  RolePermissionTab: ({ scope }: { scope: string }) => (
    <div data-testid="role-permission-tab-stub" data-scope={scope} />
  ),
}));

interface MockAuth {
  isSystemAdmin: boolean;
  isTenantAdmin: boolean;
  user: { role: 'system_admin' | 'tenant_admin' };
  hasPermission: (p: string) => boolean;
}

let mockAuth: MockAuth = {
  isSystemAdmin: true,
  isTenantAdmin: false,
  user: { role: 'system_admin' },
  hasPermission: (p: string) => p === 'manage_users' || p === 'manage_login_security',
};
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuth,
}));

const getUsersMock = vi.fn();
const createUserMock = vi.fn();
const updateUserMock = vi.fn();
const deleteUserMock = vi.fn();
const unlockUserMock = vi.fn();
const setUserStatusMock = vi.fn();
const forceOfflineUserMock = vi.fn();
const bulkUsersMock = vi.fn();
vi.mock('@/lib/api/users', () => ({
  getUsers: (...args: unknown[]) => getUsersMock(...args),
  createUser: (...args: unknown[]) => createUserMock(...args),
  updateUser: (...args: unknown[]) => updateUserMock(...args),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
  unlockUser: (...args: unknown[]) => unlockUserMock(...args),
  setUserStatus: (...args: unknown[]) => setUserStatusMock(...args),
  forceOfflineUser: (...args: unknown[]) => forceOfflineUserMock(...args),
  bulkUsers: (...args: unknown[]) => bulkUsersMock(...args),
}));

const getTenantUsersMock = vi.fn();
const createTenantUserMock = vi.fn();
const updateTenantUserMock = vi.fn();
const deleteTenantUserMock = vi.fn();
const setTenantUserStatusMock = vi.fn();
const forceOfflineTenantUserMock = vi.fn();
const bulkTenantUsersMock = vi.fn();
vi.mock('@/lib/api/tenant-users', () => ({
  getTenantUsers: (...args: unknown[]) => getTenantUsersMock(...args),
  createTenantUser: (...args: unknown[]) => createTenantUserMock(...args),
  updateTenantUser: (...args: unknown[]) => updateTenantUserMock(...args),
  deleteTenantUser: (...args: unknown[]) => deleteTenantUserMock(...args),
  setTenantUserStatus: (...args: unknown[]) => setTenantUserStatusMock(...args),
  forceOfflineTenantUser: (...args: unknown[]) => forceOfflineTenantUserMock(...args),
  bulkTenantUsers: (...args: unknown[]) => bulkTenantUsersMock(...args),
}));

const listTenantsMock = vi.fn();
vi.mock('@/lib/api/tenants', () => ({
  listTenants: (...args: unknown[]) => listTenantsMock(...args),
}));

const getRolesMock = vi.fn();
vi.mock('@/lib/api/roles', () => ({
  getRoles: (...args: unknown[]) => getRolesMock(...args),
  // 既有缺口：page.tsx 一直 import roleQueryKeys（缓存键工厂，纯函数），
  // mock 里漏导出导致整个文件 14 例全红。按真实实现形状补齐。
  roleQueryKeys: {
    all: ['roles'] as const,
    list: (tenantId?: number | null) => ['roles', 'list', tenantId ?? null] as const,
  },
}));

import UsersPage from './page';

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'alice',
    role: 'tenant_admin',
    roleId: 3,
    status: 'normal',
    tenant_id: 1,
    name: 'Alice',
    phone: '13800000001',
    online: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        <UsersPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEffectiveTenantId = null;
  mockAuth = {
    isSystemAdmin: true,
    isTenantAdmin: false,
    user: { role: 'system_admin' as const },
    hasPermission: (p: string) => p === 'manage_users' || p === 'manage_login_security',
  };
  getUsersMock.mockResolvedValue([
    baseUser({ id: 1, username: 'alice', status: 'normal' }),
    baseUser({ id: 2, username: 'bob', status: 'disabled' }),
  ]);
  getTenantUsersMock.mockResolvedValue([baseUser({ id: 5, username: 'tenant-alice' })]);
  listTenantsMock.mockResolvedValue({ items: [{ id: 1, name: 'Acme' }], total: 1 });
  getRolesMock.mockResolvedValue([
    { id: 3, name: '租户管理员', scope: 'tenant' },
    { id: 9, name: '系统管理员', scope: 'platform' },
  ]);
  setUserStatusMock.mockResolvedValue(undefined);
  forceOfflineUserMock.mockResolvedValue(undefined);
  bulkUsersMock.mockResolvedValue(undefined);
});

describe('UsersPage account tab (Task 9)', () => {
  it('renders the 禁用 status badge for a disabled account', async () => {
    wrap();
    const badge = await screen.findByTestId('user-status-badge-2');
    expect(badge).toHaveTextContent('禁用');
  });

  it('force-offline button calls forceOfflineUser with the row id after confirm', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    fireEvent.click(screen.getByTestId('force-offline-1'));
    fireEvent.click(await screen.findByRole('button', { name: '确认' }));

    await waitFor(() => expect(forceOfflineUserMock).toHaveBeenCalledWith(1, apiRequestMock));
  });

  it('toggling status on a normal account opens a confirm dialog before disabling', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    fireEvent.click(screen.getByTestId('toggle-status-1'));
    expect(setUserStatusMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(setUserStatusMock).toHaveBeenCalledWith(1, 'disabled', apiRequestMock),
    );
  });

  it('toggling status on a disabled account re-enables it without a confirm dialog', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    fireEvent.click(screen.getByTestId('toggle-status-2'));

    await waitFor(() =>
      expect(setUserStatusMock).toHaveBeenCalledWith(2, 'normal', apiRequestMock),
    );
  });

  it('selecting rows reveals the batch bar, and batch-disable calls bulkUsers with the selected ids', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    expect(screen.queryByTestId('batch-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('user-row-checkbox-1'));
    fireEvent.click(screen.getByTestId('user-row-checkbox-2'));
    expect(await screen.findByTestId('batch-bar')).toBeTruthy();

    fireEvent.click(screen.getByTestId('batch-disable'));
    fireEvent.click(await screen.findByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(bulkUsersMock).toHaveBeenCalledWith(
        { action: 'disable', ids: expect.arrayContaining([1, 2]) },
        apiRequestMock,
      ),
    );
  });

  it('the new-admin drawer exposes a phone input and a role_id select', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    fireEvent.click(screen.getByRole('button', { name: /新建/ }));

    expect(await screen.findByTestId('new-admin-phone')).toBeTruthy();
    expect(screen.getByTestId('new-admin-role-select')).toBeTruthy();
  });

  it('tenant-admin viewers source accounts from getTenantUsers, not getUsers', async () => {
    mockAuth = {
      isSystemAdmin: false,
      isTenantAdmin: true,
      user: { role: 'tenant_admin' as const },
      hasPermission: (p: string) => p === 'manage_login_security',
    };
    wrap();

    await screen.findByText('tenant-alice');
    expect(getTenantUsersMock).toHaveBeenCalled();
    expect(getUsersMock).not.toHaveBeenCalled();
  });

  it('renders a stable user-row-<id> testid on each account row', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    expect(screen.getByTestId('user-row-1')).toBeTruthy();
    expect(screen.getByTestId('user-row-2')).toBeTruthy();
  });

  // "impersonation drives tenant scope" (product decision): a system_admin who
  // has selected a tenant via the global TenantSelector must operate the
  // account tab in TENANT scope, same as a tenant_admin — not the platform
  // /users view. useApiRequest()'s effectiveTenantId is exactly how the real
  // hook models "a tenant is selected" for a system_admin (it IS
  // selectedTenantId in that case), so simulating it here is a faithful stand-in
  // for auth-context's selectedTenantId without needing to fork the auth-context
  // mock's shape.
  it('system_admin viewers with a tenant selected (impersonation) also source accounts from getTenantUsers, not getUsers', async () => {
    mockEffectiveTenantId = 7;
    wrap();

    await screen.findByText('tenant-alice');
    expect(getTenantUsersMock).toHaveBeenCalled();
    expect(getUsersMock).not.toHaveBeenCalled();
  });

  // GT-12308：解锁不再是平台专属入口——POST /users/:id/unlock 挂 protected
  // 且 handler 内做租户隔离，租户视角必须能解锁本租户账号（永久锁定
  // lockout_minutes=-1 时这是唯一的控制台恢复通道）。本用例此前断言的
  // "租户视角隐藏解锁"正是被修复的缺陷行为。
  it('system_admin viewers with a tenant selected keep the unlock action (tenant-isolated server-side)', async () => {
    mockEffectiveTenantId = 7;
    wrap();

    await screen.findByText('tenant-alice');
    expect(screen.getByTestId('unlock-user-5')).toBeTruthy();
  });

  it('system_admin viewers with NO tenant selected keep the platform view (getUsers, not getTenantUsers)', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    expect(getUsersMock).toHaveBeenCalled();
    expect(getTenantUsersMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('unlock-user-1')).toBeTruthy();
  });
});

describe('UsersPage 角色权限 tab gating (Plan C Task 7)', () => {
  it('hides the roles tab when the caller lacks manage_roles', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');

    expect(screen.queryByTestId('users-tab-roles')).toBeNull();
  });

  it('shows the roles tab, scoped to platform, for a true platform admin with manage_roles', async () => {
    mockAuth = {
      isSystemAdmin: true,
      isTenantAdmin: false,
      user: { role: 'system_admin' as const },
      hasPermission: (p: string) => p === 'manage_users' || p === 'manage_login_security' || p === 'manage_roles',
    };
    wrap();
    await screen.findByTestId('user-status-badge-2');

    fireEvent.click(screen.getByTestId('users-tab-roles'));
    const stub = await screen.findByTestId('role-permission-tab-stub');
    expect(stub.dataset.scope).toBe('platform');
  });

  it('scopes the roles tab to tenant for a tenant_admin with manage_roles', async () => {
    mockAuth = {
      isSystemAdmin: false,
      isTenantAdmin: true,
      user: { role: 'tenant_admin' as const },
      hasPermission: (p: string) => p === 'manage_login_security' || p === 'manage_roles',
    };
    wrap();
    await screen.findByText('tenant-alice');

    fireEvent.click(screen.getByTestId('users-tab-roles'));
    const stub = await screen.findByTestId('role-permission-tab-stub');
    expect(stub.dataset.scope).toBe('tenant');
  });
});
