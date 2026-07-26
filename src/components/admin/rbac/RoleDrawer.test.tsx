import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import type { Role } from '@/lib/api/roles';

// Plan C Task 7: RoleDrawer is the create/edit surface for a single role —
// name/remark + the two-part matrix (module-visible checkboxes, then an
// action table restricted to whatever is currently visible). It consumes
// Task 4's pure `role-permissions.ts` linkage functions (toggleVisible /
// toggleAction via updatePermissionsVisible / updatePermissionsAction) for
// the 3-state 联动, so this test exercises the WIRING (does clicking the
// right testid actually call through and re-render), not the linkage math
// itself (already unit-tested in role-permissions.test.ts).

const createRoleMock = vi.fn();
const updateRoleMock = vi.fn();
vi.mock('@/lib/api/roles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/roles')>('@/lib/api/roles');
  return {
    ...actual,
    useCreateRole: () => ({ mutate: createRoleMock, isPending: false }),
    useUpdateRole: () => ({ mutate: updateRoleMock, isPending: false }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RoleDrawer } from './RoleDrawer';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const templateRole: Role = {
  id: 42,
  name: '租户默认管理员',
  remark: '内置模板',
  scope: 'tenant',
  isSystemDefault: true,
  status: 'normal',
  permissions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RoleDrawer (Plan C Task 7)', () => {
  it('reveals the action row for a submodule once its visible checkbox is ticked, and unsupported approve renders "-"', async () => {
    wrap(<RoleDrawer open onOpenChange={() => {}} scope="tenant" role={null} existingNames={[]} />);

    // login-security supports view/edit only (supportApprove/supportDelete both
    // false in rbac-modules.ts) — a stable target for the "-" assertion.
    const visibleCb = screen.getByTestId('role-perm-new-login-security-visible');
    expect(screen.queryByTestId('role-perm-new-login-security-view')).toBeNull();

    fireEvent.click(visibleCb);

    const viewCb = await screen.findByTestId('role-perm-new-login-security-view');
    expect(viewCb).toBeTruthy();

    const approveCell = screen.getByTestId('role-perm-new-login-security-approve');
    expect(approveCell.textContent).toBe('-');
    expect(approveCell.getAttribute('role')).not.toBe('checkbox');
  });

  it('checking edit auto-checks view (3-state 联动)', async () => {
    wrap(<RoleDrawer open onOpenChange={() => {}} scope="tenant" role={null} existingNames={[]} />);

    fireEvent.click(screen.getByTestId('role-perm-new-login-security-visible'));
    const editCb = await screen.findByTestId('role-perm-new-login-security-edit');
    const viewCb = screen.getByTestId('role-perm-new-login-security-view');

    expect(viewCb).not.toBeChecked();
    fireEvent.click(editCb);

    await waitFor(() => expect(viewCb).toBeChecked());
    expect(editCb).toBeChecked();
  });

  it('unchecking view cascades edit back off', async () => {
    wrap(<RoleDrawer open onOpenChange={() => {}} scope="tenant" role={null} existingNames={[]} />);

    fireEvent.click(screen.getByTestId('role-perm-new-login-security-visible'));
    const editCb = await screen.findByTestId('role-perm-new-login-security-edit');
    const viewCb = screen.getByTestId('role-perm-new-login-security-view');

    fireEvent.click(editCb);
    await waitFor(() => expect(viewCb).toBeChecked());

    fireEvent.click(viewCb);
    await waitFor(() => expect(viewCb).not.toBeChecked());
    expect(editCb).not.toBeChecked();
  });

  it('a system-default / global-template role renders every input disabled', () => {
    wrap(<RoleDrawer open onOpenChange={() => {}} scope="tenant" role={templateRole} existingNames={[]} />);

    expect(screen.getByTestId('role-name-input')).toBeDisabled();
    expect(screen.getByTestId('role-remark-input')).toBeDisabled();
    expect(screen.queryByTestId('role-save')).toBeNull();
  });

  it('saving a new role calls createRole with the scope + name + matrix', async () => {
    wrap(<RoleDrawer open onOpenChange={() => {}} scope="tenant" role={null} existingNames={[]} />);

    fireEvent.change(screen.getByTestId('role-name-input'), { target: { value: '自定义运营' } });
    fireEvent.click(screen.getByTestId('role-perm-new-login-security-visible'));
    fireEvent.click(screen.getByTestId('role-save'));

    await waitFor(() => expect(createRoleMock).toHaveBeenCalled());
    const body = createRoleMock.mock.calls[0][0];
    expect(body.scope).toBe('tenant');
    expect(body.name).toBe('自定义运营');
    expect(body.permissions.find((p: { submoduleId: string }) => p.submoduleId === 'login-security').visible).toBe(true);
  });

  it('saving an existing role calls updateRole with its id', async () => {
    const editable: Role = { ...templateRole, id: 7, isSystemDefault: false };
    wrap(<RoleDrawer open onOpenChange={() => {}} scope="tenant" role={editable} existingNames={[]} />);

    fireEvent.click(screen.getByTestId('role-save'));

    await waitFor(() => expect(updateRoleMock).toHaveBeenCalled());
    expect(updateRoleMock.mock.calls[0][0].id).toBe(7);
  });
});
