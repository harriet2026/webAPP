import { apiRequest, type ApiRequestFn } from './client';
import type { BulkUsersAction, User, UserStatus } from '@/types/user';

export interface CreateUserRequest {
  username: string;
  password: string;
  role?: string;
  // Task 8: role_id is now the authoritative field server-side (internal/api
  // resolveRoleID); role is accepted only for back-compat / conflict-checking.
  role_id?: number;
  tenant_id?: number;
  must_change_password?: boolean;
  name?: string;
  phone?: string;
  email?: string;
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  role?: string;
  role_id?: number;
  tenant_id?: number;
  must_change_password?: boolean;
  name?: string;
  phone?: string;
  email?: string;
}

export async function getUsers(requestFn: ApiRequestFn = apiRequest): Promise<User[]> {
  const res = await requestFn<{ items: User[] }>('/users');
  return res.items;
}

export function createUser(data: CreateUserRequest, requestFn: ApiRequestFn = apiRequest): Promise<User> {
  return requestFn<User>('/users', {
    method: 'POST',
    body: data,
  });
}

export function updateUser(id: number, data: UpdateUserRequest, requestFn: ApiRequestFn = apiRequest): Promise<User> {
  return requestFn<User>(`/users/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export function deleteUser(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/users/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Clear every login-lockout bucket for one account (GT-11959).
 *
 * This is the ONLY console path out of a permanent lock (lockout_minutes = -1),
 * which has no natural expiry. The alternative — the internal ResetAdminLockout —
 * clears ALL lockouts cluster-wide, so freeing one user with it would lift
 * brute-force protection for everyone.
 *
 * A tenant admin may only unlock members of their own tenant (enforced server-side).
 * Idempotent: unlocking an account that is not locked is a 204, not an error.
 */
export function unlockUser(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/users/${id}/unlock`, { method: 'POST' });
}

/**
 * Enable/disable a platform account (internal/api SetUserStatusHandler,
 * PUT /api/v1/users/:id/status). Disabling revokes every live session for
 * the account server-side; the server rejects disabling the last enabled
 * true super admin with 409.
 */
export function setUserStatus(
  id: number,
  status: UserStatus,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn<void>(`/users/${id}/status`, { method: 'PUT', body: { status } });
}

/**
 * Force a platform account offline (internal/api ForceOfflineUser,
 * POST /api/v1/users/:id/force-offline). Unlike setUserStatus('disabled'),
 * this does not touch users.status — it only kicks live sessions, so the
 * holder can log back in immediately. Idempotent.
 */
export function forceOfflineUser(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/users/${id}/force-offline`, { method: 'POST' });
}

export interface BulkUsersRequest {
  action: BulkUsersAction;
  ids: number[];
}

/**
 * Multi-select bulk action on platform accounts (internal/api BulkUsers,
 * POST /api/v1/users/bulk). Whole-batch preflight server-side: either the
 * entire batch applies, or none of it does.
 */
// GT-12315：批量接口返回应用/跳过明细（disable 会静默跳过当前登录账号，
// 前端据此给出"已跳过"反馈，而不是让管理员误以为自己也被停用了）。
export interface BulkUsersResult {
  applied: number;
  skipped: number[];
}

export function bulkUsers(body: BulkUsersRequest, requestFn: ApiRequestFn = apiRequest): Promise<BulkUsersResult> {
  return requestFn<BulkUsersResult>('/users/bulk', { method: 'POST', body });
}
