// Task 8: tenant-scoped mirror of lib/api/users.ts, hitting the
// /tenant-users prefix registered by internal/api/tenant_users.go
// (registerTenantUserRoutes). Every handler on the Go side enforces tenant
// scope server-side via GetEffectiveTenantID/tenantOwnsUser, so the X-Tenant-ID
// header threading is handled the same way as any other tenant-scoped call
// (useApiRequest / useScopedApiRequest in lib/api/client.ts) — callers should
// pass the hook's `apiRequest` as requestFn rather than a bare tenant id here.
//
// Request-body shapes deliberately differ from the platform /users contract,
// matching CreateTenantUserRequest/UpdateTenantUserRequest in
// internal/api/tenant_users.go exactly:
//   - CreateTenantUserRequest has no role/tenant_id (role is always forced to
//     tenant_admin, tenant_id is always the caller's effective tenant).
//   - UpdateTenantUserRequest additionally has no username field.
import { apiRequest, type ApiRequestFn } from './client';
import type { BulkUsersAction, TenantUser, UserStatus } from '@/types/user';
import type { BulkUsersResult } from '@/lib/api/users';

export interface CreateTenantUserRequest {
  username: string;
  password: string;
  role_id?: number;
  name?: string;
  phone?: string;
  email?: string;
}

export interface UpdateTenantUserRequest {
  password?: string;
  role_id?: number;
  name?: string;
  phone?: string;
  email?: string;
}

export interface BulkTenantUsersRequest {
  action: BulkUsersAction;
  ids: number[];
}

export async function getTenantUsers(requestFn: ApiRequestFn = apiRequest): Promise<TenantUser[]> {
  const res = await requestFn<{ items: TenantUser[] }>('/tenant-users');
  return res.items;
}

export function createTenantUser(
  data: CreateTenantUserRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<TenantUser> {
  return requestFn<TenantUser>('/tenant-users', { method: 'POST', body: data });
}

export function updateTenantUser(
  id: number,
  data: UpdateTenantUserRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<TenantUser> {
  return requestFn<TenantUser>(`/tenant-users/${id}`, { method: 'PUT', body: data });
}

export function deleteTenantUser(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/tenant-users/${id}`, { method: 'DELETE' });
}

/**
 * Enable/disable an account within the caller's tenant (internal/api
 * SetTenantUserStatusHandler, PUT /api/v1/tenant-users/:id/status).
 */
export function setTenantUserStatus(
  id: number,
  status: UserStatus,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn<void>(`/tenant-users/${id}/status`, { method: 'PUT', body: { status } });
}

/**
 * Force an in-tenant account offline (internal/api ForceOfflineTenantUser,
 * POST /api/v1/tenant-users/:id/force-offline). Idempotent, does not touch
 * status.
 */
export function forceOfflineTenantUser(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/tenant-users/${id}/force-offline`, { method: 'POST' });
}

/**
 * Multi-select bulk action scoped to the caller's tenant (internal/api
 * BulkTenantUsers, POST /api/v1/tenant-users/bulk). Whole-batch preflight
 * server-side, same contract as the platform bulkUsers.
 */
export function bulkTenantUsers(
  body: BulkTenantUsersRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<BulkUsersResult> {
  return requestFn<BulkUsersResult>('/tenant-users/bulk', { method: 'POST', body });
}
