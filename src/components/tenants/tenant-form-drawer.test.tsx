import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { Tenant } from '@/types/tenant';
import type { User } from '@/types/user';

// GT-12290：租户编辑抽屉的「主管理员」此前恒显示「未设置」——根因是它用
// getUsers() 拉平台作用域列表（GT-12393 起该列表不含任何租户账号）再本地
// find，两者永远对不上。本测试断言修复后的行为：getUsers 必须带上该租户的
// id 调用，且渲染出取到的账号名而不是「未设置」。

const t = getTestTenant();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

// `@/i18n/navigation`'s real Link pulls in next/navigation, which fails to
// resolve under Vitest's plain ESM resolver (see users/page.test.tsx for the
// same note) — stub it out; the "在用户管理中查看" link's href/label are not
// under test here, only whether it renders.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ registry: [] }),
}));

const getUsersMock = vi.fn();
vi.mock('@/lib/api/users', () => ({
  getUsers: (...args: unknown[]) => getUsersMock(...args),
}));

const getTenantDomainsMock = vi.fn();
vi.mock('@/lib/api/tenants', () => ({
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  getTenantDomains: (...args: unknown[]) => getTenantDomainsMock(...args),
  createTenantDomain: vi.fn(),
  deleteTenantDomain: vi.fn(),
}));

import { TenantFormDrawer } from './tenant-form-drawer';

function getTestTenant(): Tenant {
  return {
    id: 19793,
    name: 'GT-12290 UI',
    description: '',
    language: 'zh',
    code: 'gt12290ui83377057',
    status: 'active',
    expire_at: null,
    capability_flags: [],
    routing_progress: { receiving: false, relay: false, outbound: false, auth: false },
    expired: false,
    access_status: 'configured',
    domain_count: 0,
    created_at: '2026-07-25T00:00:00Z',
    updated_at: '2026-07-25T00:00:00Z',
  };
}

function tenantAdminUser(): User {
  return {
    id: 501,
    username: 'gt12290-ui-83377057',
    role: 'tenant_admin',
    tenant_id: 19793,
    must_change_password: true,
    created_at: '2026-07-25T00:00:00Z',
    updated_at: '2026-07-25T00:00:00Z',
  };
}

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantFormDrawer open={true} onOpenChange={() => {}} editingTenant={t} />
    </QueryClientProvider>,
  );
}

function renderCreateDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantFormDrawer open={true} onOpenChange={() => {}} editingTenant={null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantDomainsMock.mockResolvedValue([]);
  getUsersMock.mockResolvedValue([tenantAdminUser()]);
});

describe('TenantFormDrawer primary admin (GT-12290)', () => {
  it('fetches users scoped to the editing tenant id, not the platform-wide list', async () => {
    renderDrawer();

    await waitFor(() => expect(getUsersMock).toHaveBeenCalled());
    // getUsers(requestFn, tenantId) — 第一个参数固定为模块级默认 undefined
    // （沿用 apiRequest），第二个参数必须是该租户 id。
    expect(getUsersMock).toHaveBeenCalledWith(undefined, t.id);
  });

  it('renders the primary admin username instead of "未设置" once the scoped query resolves', async () => {
    renderDrawer();

    expect(await screen.findByText('gt12290-ui-83377057')).toBeInTheDocument();
    expect(screen.queryByText('detail.primaryAdminNone')).not.toBeInTheDocument();
  });
});

describe('TenantFormDrawer validation feedback', () => {
  it('lists every missing required field after Save instead of looking unresponsive', async () => {
    renderCreateDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    const summary = await screen.findByTestId('tenant-form-validation-summary');
    const scoped = within(summary);
    expect(scoped.getByText('validationFailed')).toBeInTheDocument();
    expect(summary).toHaveTextContent('nameRequired');
    expect(summary).toHaveTextContent('codeRequired');
    expect(summary).toHaveTextContent('adminAccountRequired');
    expect(summary).toHaveTextContent('adminPasswordRequired');
    expect(summary).toHaveTextContent('domainsRequired');

    expect(document.querySelector('input[name="name"]')).toBeInvalid();
    expect(screen.getByTestId('tenant-admin-password')).toBeInvalid();
  });
});
