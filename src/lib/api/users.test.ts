import { describe, it, expect, vi } from 'vitest';
import { setUserStatus, forceOfflineUser, bulkUsers, createUser, updateUser } from './users';

describe('users account API (Task 8)', () => {
  it('setUserStatus PUTs /users/:id/status with {status}', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await setUserStatus(7, 'disabled', fn as never);
    expect(fn).toHaveBeenCalledWith('/users/7/status', { method: 'PUT', body: { status: 'disabled' } });
  });

  it('setUserStatus can re-enable a user', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await setUserStatus(7, 'normal', fn as never);
    expect(fn).toHaveBeenCalledWith('/users/7/status', { method: 'PUT', body: { status: 'normal' } });
  });

  it('forceOfflineUser POSTs /users/:id/force-offline with no body', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await forceOfflineUser(7, fn as never);
    expect(fn).toHaveBeenCalledWith('/users/7/force-offline', { method: 'POST' });
  });

  it('bulkUsers POSTs /users/bulk with {action, ids}', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await bulkUsers({ action: 'disable', ids: [1, 2] }, fn as never);
    expect(fn).toHaveBeenCalledWith('/users/bulk', { method: 'POST', body: { action: 'disable', ids: [1, 2] } });
  });

  it('bulkUsers supports enable and delete actions', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await bulkUsers({ action: 'enable', ids: [3] }, fn as never);
    expect(fn).toHaveBeenCalledWith('/users/bulk', { method: 'POST', body: { action: 'enable', ids: [3] } });
    await bulkUsers({ action: 'delete', ids: [4, 5] }, fn as never);
    expect(fn).toHaveBeenCalledWith('/users/bulk', { method: 'POST', body: { action: 'delete', ids: [4, 5] } });
  });

  it('createUser threads name/phone/email/role_id through to POST /users', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    await createUser(
      {
        username: 'alice',
        password: 'pw',
        role_id: 3,
        name: 'Alice',
        phone: '13800000000',
        email: 'alice@example.com',
      },
      fn as never,
    );
    expect(fn).toHaveBeenCalledWith('/users', {
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

  it('updateUser threads name/phone/email/role_id through to PUT /users/:id', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    await updateUser(
      1,
      { name: 'Bob', phone: '13900000000', email: 'bob@example.com', role_id: 5 },
      fn as never,
    );
    expect(fn).toHaveBeenCalledWith('/users/1', {
      method: 'PUT',
      body: { name: 'Bob', phone: '13900000000', email: 'bob@example.com', role_id: 5 },
    });
  });
});
