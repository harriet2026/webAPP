import { describe, it, expect, vi } from 'vitest';
import type { Role } from './roles';
import {
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  setRoleStatus,
} from './roles';

// Plan C Task 2 — thin functions over the Plan A roles API
// (internal/api/roles.go). Field names must match the Go json tags verbatim
// (internal/models/role.go): camelCase on the Role/RolePermission wire shape
// (isSuperAdmin, submoduleId, canView, ...), snake_case on the request body's
// top-level fields already established elsewhere (role_id on users.ts) does
// NOT apply here — CreateRoleRequest/UpdateRoleRequest/SetRoleStatusRequest
// use plain lowercase (scope/name/remark/permissions/status).
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

describe('roles data-layer types', () => {
  it('Role/RolePermission field names align with Plan A JSON tags', () => {
    const r: Role = {
      id: 1,
      code: 'super_admin',
      isSuperAdmin: true,
      name: 'x',
      remark: '',
      scope: 'platform',
      isSystemDefault: true,
      status: 'normal',
      permissions: [
        { submoduleId: 'disposal-center', visible: true, canView: true, canEdit: false, canApprove: null, canDelete: null },
      ],
      updatedAt: '',
    };
    expect(r.permissions?.[0].submoduleId).toBe('disposal-center');
    expect(r.permissions?.[0].canApprove).toBeNull();
  });
});

describe('roles data-layer functions (Plan A /roles API contract)', () => {
  it('getRoles GETs /roles and unwraps items', async () => {
    const fn = vi.fn().mockResolvedValue({ items: [{ id: 1, name: 'x', scope: 'platform' }] });
    const roles = await getRoles(fn as never);
    expect(fn).toHaveBeenCalledWith('/roles');
    expect(roles).toEqual([{ id: 1, name: 'x', scope: 'platform' }]);
  });

  it('getRole GETs /roles/:id (includes the permission matrix)', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 3, name: 'y', scope: 'tenant', permissions: [] });
    const role = await getRole(3, fn as never);
    expect(fn).toHaveBeenCalledWith('/roles/3');
    expect(role.id).toBe(3);
  });

  it('createRole POSTs /roles with scope/name/remark/permissions', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 9 });
    const body = {
      scope: 'tenant' as const,
      name: 'ops',
      remark: 'tenant ops role',
      permissions: [
        { submoduleId: 'disposal-center', visible: true, canView: true, canEdit: null, canApprove: null, canDelete: null },
      ],
    };
    await createRole(body, fn as never);
    expect(fn).toHaveBeenCalledWith('/roles', { method: 'POST', body });
  });

  it('updateRole PUTs /roles/:id with name/remark/permissions', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 9 });
    const body = { name: 'ops-2', remark: '', permissions: [] };
    await updateRole(9, body, fn as never);
    expect(fn).toHaveBeenCalledWith('/roles/9', { method: 'PUT', body });
  });

  it('deleteRole DELETEs /roles/:id', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await deleteRole(9, fn as never);
    expect(fn).toHaveBeenCalledWith('/roles/9', { method: 'DELETE' });
  });

  it("setRoleStatus(3,'disabled') PUTs /roles/3/status {status:'disabled'}", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 3, status: 'disabled' });
    await setRoleStatus(3, 'disabled', fn as never);
    expect(fn).toHaveBeenCalledWith('/roles/3/status', { method: 'PUT', body: { status: 'disabled' } });
  });

  it("setRoleStatus can re-enable a role ('normal')", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 3, status: 'normal' });
    await setRoleStatus(3, 'normal', fn as never);
    expect(fn).toHaveBeenCalledWith('/roles/3/status', { method: 'PUT', body: { status: 'normal' } });
  });
});
