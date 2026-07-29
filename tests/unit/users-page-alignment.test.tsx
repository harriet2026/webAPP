// GT-12308/12309/12312/12314/12318 —— 管理员与权限页对齐原型的防回归单测。
// mock 栈复制自 src/app/[locale]/(dashboard)/users/page.test.tsx（同款约定）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '../../messages/zh.json';
import type { User } from '@/types/user';

const apiRequestMock = vi.fn();
let mockEffectiveTenantId: number | null = null;
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: apiRequestMock, effectiveTenantId: mockEffectiveTenantId }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  // The users page now calls useRouter() (row action → router.push). The mock
  // must export it or the whole page render throws "No useRouter export".
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/components/admin/login-security/LoginSecurityTab', () => ({
  LoginSecurityTab: () => <div data-testid="login-security-tab-stub" />,
}));

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
  hasPermission: () => true,
};
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuth,
}));

const getUsersMock = vi.fn();
const getTenantUsersMock = vi.fn();
const listTenantsMock = vi.fn();
const getRolesMock = vi.fn();
vi.mock('@/lib/api/users', () => ({
  getUsers: (...args: unknown[]) => getUsersMock(...args),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  unlockUser: vi.fn(),
  setUserStatus: vi.fn(),
  forceOfflineUser: vi.fn(),
  bulkUsers: vi.fn(),
}));
vi.mock('@/lib/api/tenant-users', () => ({
  getTenantUsers: (...args: unknown[]) => getTenantUsersMock(...args),
  createTenantUser: vi.fn(),
  updateTenantUser: vi.fn(),
  deleteTenantUser: vi.fn(),
  setTenantUserStatus: vi.fn(),
  forceOfflineTenantUser: vi.fn(),
  bulkTenantUsers: vi.fn(),
}));
vi.mock('@/lib/api/tenants', () => ({
  listTenants: (...args: unknown[]) => listTenantsMock(...args),
}));
vi.mock('@/lib/api/roles', () => ({
  getRoles: (...args: unknown[]) => getRolesMock(...args),
  roleQueryKeys: {
    all: ['roles'] as const,
    list: (tenantId?: number | null) => ['roles', 'list', tenantId ?? null] as const,
  },
}));

import UsersPage from '@/app/[locale]/(dashboard)/users/page';

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
  } as User;
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
    hasPermission: () => true,
  };
  getUsersMock.mockResolvedValue([
    baseUser({ id: 1, username: 'alice', online: true, last_login_at: '2026-07-20T10:00:00Z' } as Partial<User>),
    baseUser({ id: 2, username: 'bob', online: false, last_login_at: '2026-07-19T10:00:00Z' } as Partial<User>),
  ]);
  getTenantUsersMock.mockResolvedValue([baseUser({ id: 5, username: 'tenant-alice' })]);
  listTenantsMock.mockResolvedValue({ items: [{ id: 1, name: 'Acme' }], total: 1 });
  getRolesMock.mockResolvedValue([
    { id: 3, name: '安全运营', scope: 'tenant', isSystemDefault: true },
    { id: 9, name: '系统管理员', scope: 'platform', isSystemDefault: true },
  ]);
});

describe('GT-12312 页签顺序 / 表头 / 当前在线提示', () => {
  it('tab 顺序为 管理员账号 → 角色权限 → 登录安全（原型顺序）', async () => {
    wrap();
    await screen.findByTestId('users-tab-accounts');
    const tabs = screen.getAllByRole('tab').map((el) => el.getAttribute('data-testid'));
    expect(tabs).toEqual(['users-tab-accounts', 'users-tab-roles', 'users-tab-login-security']);
  });

  it('账号表头首列为「账号/用户名」', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');
    expect(screen.getByText('账号/用户名')).toBeTruthy();
  });

  it('系统派生列（在线/最后登录时间）已随列表-表单字段对齐移除（GT-12629）', async () => {
    // GT-12629（原型 fb4b6a2）：账号列表仅保留与新建/编辑弹窗一致的业务字段，
    // ID/在线/最后登录时间等系统派生只读列整体移除。此前 GT-12312 的绿点
    // （user-lastlogin-online-dot-*）随最后登录列一并下线，这里守住不回流。
    wrap();
    await screen.findByTestId('user-status-badge-2');
    expect(screen.queryByTestId('user-lastlogin-online-dot-1')).toBeNull();
    expect(screen.queryByTestId('user-lastlogin-1')).toBeNull();
    expect(screen.queryByTestId('user-online-1')).toBeNull();
  });
});

describe('GT-12314 独立重置密码入口', () => {
  it('每行有「重置密码」操作，点击打开对话框', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');
    fireEvent.click(screen.getByTestId('reset-password-1'));
    expect(await screen.findByTestId('reset-password-dialog')).toBeTruthy();
    expect(screen.getByTestId('reset-password-generate')).toBeTruthy();
  });
});

describe('GT-12309 平台视角角色下拉过滤', () => {
  it('平台视角创建账号的角色下拉只含平台角色', async () => {
    wrap();
    await screen.findByTestId('user-status-badge-2');
    fireEvent.click(screen.getByRole('button', { name: /新建/ }));
    fireEvent.click(await screen.findByTestId('new-admin-role-select'));
    // Base UI Select 的选项在 popup 中渲染（jsdom 下同文档）。断言限定在 role=option
    // 上：GT-12391 起账号表格会把用户的实际角色名（含租户角色「安全运营」）渲染进
    // 页面，页面级 queryByText 会误命中表格里的它。这里只关心「下拉选项」是否按视角
    // 过滤，所以按 option 角色断言，既精确又不受表格渲染影响。
    expect(await screen.findByRole('option', { name: '系统管理员' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '安全运营' })).toBeNull();
  });
});

describe('GT-12308 / GT-12318 租户视角行为', () => {
  it('租户视角保留解锁入口（服务端租户隔离）', async () => {
    mockEffectiveTenantId = 7;
    wrap();
    await screen.findByText('tenant-alice');
    expect(screen.getByTestId('unlock-user-5')).toBeTruthy();
  });

  it('租户视角创建账号不渲染首登改密开关，显示固定提示', async () => {
    mockEffectiveTenantId = 7;
    wrap();
    await screen.findByText('tenant-alice');
    fireEvent.click(screen.getByRole('button', { name: /新建/ }));
    await screen.findByTestId('create-user-dialog');
    expect(screen.queryByTestId('user-must-change-checkbox')).toBeNull();
    expect(screen.getByTestId('tenant-must-change-notice')).toBeTruthy();
  });

  it('平台视角创建账号同样不渲染首登改密开关，显示固定提示（GT-12318 移除开关）', async () => {
    // mockEffectiveTenantId=null（平台视角，beforeEach 默认）
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: /新建/ }));
    await screen.findByTestId('create-user-dialog');
    expect(screen.queryByTestId('user-must-change-checkbox')).toBeNull();
    expect(screen.getByTestId('tenant-must-change-notice')).toBeTruthy();
  });
});
