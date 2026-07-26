// Task 9 (Plan B) needs a role list to populate the account-tab role_id
// Select. The backend endpoint already exists (internal/api/roles.go,
// registerRoleRoutes — GET/POST /api/v1/roles, GET/PUT/DELETE /api/v1/roles/:id,
// PUT /api/v1/roles/:id/status), so this hits it for real rather than
// stubbing. GetEffectiveTenantID scopes the result server-side: a tenant
// caller sees only its own custom roles plus the read-only global templates,
// a platform caller sees the platform role list.
//
// Plan C Task 2 extends this with the full permission matrix
// (models.RolePermission) + create/update/status/delete + react-query hooks
// for the RBAC matrix UI (Plan C Task 7). Field names on Role/RolePermission
// are taken VERBATIM from the Go json tags (internal/models/role.go) — camelCase
// on the wire for this resource (isSuperAdmin, submoduleId, canView, canEdit,
// canApprove, canDelete, tenantId, isSystemDefault, updatedAt), unlike the
// snake_case request-body convention used elsewhere (e.g. users.ts's role_id).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, useApiRequest, type ApiRequestFn } from './client';
import { useAuth } from '@/contexts/auth-context';

/** Mirrors models.RolePermission (internal/models/role.go). can*: boolean|null — null means "not set / inherit". */
export interface RolePermission {
  submoduleId: string;
  visible: boolean;
  canView: boolean | null;
  canEdit: boolean | null;
  canApprove: boolean | null;
  canDelete: boolean | null;
}

/** Mirrors models.Role (internal/models/role.go). */
export interface Role {
  id: number;
  // Task 9's original minimal shape only needed name/scope/status/isSuperAdmin;
  // code/remark/tenantId/isSystemDefault/permissions/createdAt/updatedAt are
  // additive for Plan C — every field below is present on every /roles
  // response, code included, so callers that only read the Task 9 subset are
  // unaffected.
  code?: string;
  isSuperAdmin?: boolean;
  name: string;
  remark?: string;
  scope: 'platform' | 'tenant';
  /** omitempty server-side: absent for scope=platform. */
  tenantId?: number;
  isSystemDefault?: boolean;
  status?: string;
  /** omitempty server-side: present on GetRole (detail), absent on ListRoles (list). */
  permissions?: RolePermission[];
  createdAt?: string;
  updatedAt?: string;
}

/** POST /roles body — internal/api CreateRoleRequest. */
export interface CreateRoleRequest {
  scope: 'platform' | 'tenant';
  name: string;
  remark?: string;
  permissions?: RolePermission[];
}

/** PUT /roles/:id body — internal/api UpdateRoleRequest. Name/remark/matrix only: scope/tenantId/code/isSuperAdmin are immutable after creation. */
export interface UpdateRoleRequest {
  name: string;
  remark?: string;
  permissions?: RolePermission[];
}

export type RoleStatus = 'normal' | 'disabled';

// GT-12253：roles 相关 react-query key 的单一真源。列表与详情必须使用不同的
// 命名空间——旧写法 useRole 用 ['roles', id]、用户管理页用
// ['roles', effectiveTenantId]，两者都是 ['roles', <number>]：平台管理员代登录
// 的租户 id 恰好等于某个角色 id 时，角色详情（单对象）会覆盖列表缓存（数组），
// 消费方 (roles ?? []).filter 抛 "filter is not a function"（偶发、仅代登录）。
export const roleQueryKeys = {
  list: (scope: string | number | null | undefined) => ['roles', 'list', scope ?? 'default'] as const,
  detail: (id: number | null | undefined) => ['roles', 'detail', id] as const,
};

export async function getRoles(requestFn: ApiRequestFn = apiRequest): Promise<Role[]> {
  const res = await requestFn<{ items: Role[] }>('/roles');
  return res.items;
}

/** GET /roles/:id — role detail, includes the permission matrix. */
export function getRole(id: number, requestFn: ApiRequestFn = apiRequest): Promise<Role> {
  return requestFn<Role>(`/roles/${id}`);
}

export function createRole(data: CreateRoleRequest, requestFn: ApiRequestFn = apiRequest): Promise<Role> {
  return requestFn<Role>('/roles', { method: 'POST', body: data });
}

export function updateRole(
  id: number,
  data: UpdateRoleRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Role> {
  return requestFn<Role>(`/roles/${id}`, { method: 'PUT', body: data });
}

export function deleteRole(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/roles/${id}`, { method: 'DELETE' });
}

/** PUT /roles/:id/status — enable/disable a role (internal/api SetRoleStatus). */
export function setRoleStatus(
  id: number,
  status: RoleStatus,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Role> {
  return requestFn<Role>(`/roles/${id}/status`, { method: 'PUT', body: { status } });
}

// --- react-query hooks (Plan C Task 7 consumes these) ---------------------

/**
 * scope is NOT sent to the server — ListRoles derives visibility from the
 * caller's effective tenant (X-Tenant-ID, threaded by useApiRequest), never
 * from a query param. It only differentiates the cache key, for a caller
 * that wants to key a platform-scope view and a tenant-impersonation view
 * separately on the same page.
 */
export function useRoles(scope?: 'platform' | 'tenant') {
  const { apiRequest: request } = useApiRequest();
  return useQuery({
    queryKey: roleQueryKeys.list(scope),
    queryFn: () => getRoles(request),
  });
}

/** Role detail (includes the permission matrix). Disabled while id is null/undefined. */
export function useRole(id: number | null | undefined) {
  const { apiRequest: request } = useApiRequest();
  return useQuery({
    queryKey: roleQueryKeys.detail(id),
    queryFn: () => getRole(id as number, request),
    enabled: id != null,
  });
}

export function useCreateRole() {
  const { apiRequest: request } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoleRequest) => createRole(data, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRole() {
  const { apiRequest: request } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRoleRequest }) => updateRole(id, data, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useSetRoleStatus() {
  const { apiRequest: request } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: RoleStatus }) => setRoleStatus(id, status, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useDeleteRole() {
  const { apiRequest: request } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRole(id, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

/**
 * Resolves the CALLER's own role (auth.user.role_id) — the permission source
 * Task 5's hasPermission derivation will read from. null while the user has
 * no assigned role_id (legacy/unassigned account) or is not yet loaded.
 */
export function useMyRole() {
  const { user } = useAuth();
  return useRole(user?.role_id ?? null);
}
