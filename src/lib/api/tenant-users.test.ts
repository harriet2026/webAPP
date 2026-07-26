import { describe, it, expect, vi } from 'vitest';
import {
  getTenantUsers,
  createTenantUser,
  updateTenantUser,
  deleteTenantUser,
  setTenantUserStatus,
  forceOfflineTenantUser,
  bulkTenantUsers,
} from './tenant-users';

// Mirrors the platform /users contract (src/lib/api/users.test.ts) at the
// /tenant-users prefix — internal/api/tenant_users.go registerTenantUserRoutes.
describe('tenant-users account API (Task 8)', () => {
  it('getTenantUsers GETs /tenant-users and unwraps items', async () => {
    const fn = vi.fn().mockResolvedValue({ items: [{ id: 1 }] });
    const result = await getTenantUsers(fn as never);
    expect(fn).toHaveBeenCalledWith('/tenant-users');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('createTenantUser POSTs /tenant-users (no role/tenant_id in the body)', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    await createTenantUser(
      { username: 'alice', password: 'pw', role_id: 3, name: 'Alice', phone: '13800000000', email: 'alice@example.com' },
      fn as never,
    );
    expect(fn).toHaveBeenCalledWith('/tenant-users', {
      method: 'POST',
      body: {
        username: 'alice',
        password: 'pw',
        role_id: 3,
        name: 'Alice',
        phone: '13800000000',
        email: 'alice@example.com',
      },
    });
  });

  it('updateTenantUser PUTs /tenant-users/:id (no username field)', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    await updateTenantUser(1, { role_id: 5, name: 'Bob', phone: '13900000000', email: 'bob@example.com' }, fn as never);
    expect(fn).toHaveBeenCalledWith('/tenant-users/1', {
      method: 'PUT',
      body: { role_id: 5, name: 'Bob', phone: '13900000000', email: 'bob@example.com' },
    });
  });

  it('deleteTenantUser DELETEs /tenant-users/:id', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await deleteTenantUser(1, fn as never);
    expect(fn).toHaveBeenCalledWith('/tenant-users/1', { method: 'DELETE' });
  });

  it('setTenantUserStatus PUTs /tenant-users/:id/status with {status}', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await setTenantUserStatus(7, 'disabled', fn as never);
    expect(fn).toHaveBeenCalledWith('/tenant-users/7/status', { method: 'PUT', body: { status: 'disabled' } });
  });

  it('forceOfflineTenantUser POSTs /tenant-users/:id/force-offline', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await forceOfflineTenantUser(7, fn as never);
    expect(fn).toHaveBeenCalledWith('/tenant-users/7/force-offline', { method: 'POST' });
  });

  it('bulkTenantUsers POSTs /tenant-users/bulk with {action, ids}', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await bulkTenantUsers({ action: 'disable', ids: [1, 2] }, fn as never);
    expect(fn).toHaveBeenCalledWith('/tenant-users/bulk', { method: 'POST', body: { action: 'disable', ids: [1, 2] } });
  });
});
