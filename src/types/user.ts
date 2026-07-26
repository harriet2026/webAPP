// UserStatus mirrors models.RoleStatusNormal / models.RoleStatusDisabled
// (internal/models) — the account enable/disable state set via
// PUT /users/:id/status (see setUserStatus in lib/api/users.ts).
export type UserStatus = 'normal' | 'disabled';

export interface User {
  id: number;
  username: string;
  role: 'system_admin' | 'tenant_admin';
  // Task 8: role_id is now the authoritative permission source (internal/api
  // resolveRoleID); `role` above is the derived legacy string, kept for
  // back-compat. NOTE the asymmetric wire casing, taken verbatim from
  // internal/models.User / internal/api CreateUserRequest/UpdateUserRequest:
  // the GET/list response field is `roleId` (camelCase), but the POST/PUT
  // request body field is `role_id` (snake_case) — see CreateUserRequest/
  // UpdateUserRequest below.
  roleId?: number | null;
  // Plan C Task 2: carried straight from LoginResponse.role_id/is_super_admin
  // below (snake_case on the wire, unlike the camelCase `roleId` above which
  // comes from the GET/list response — see the asymmetric-casing note on
  // `roleId`). Populated by auth-context's login()/completeLogin() and
  // persisted verbatim through the `osgateway_user` localStorage JSON, so it
  // survives a page reload the same way `role`/`tenant_id` already do. Task 5
  // (permissionMatrix/hasPermission) will consume these; not yet wired into
  // the derivation here.
  role_id?: number | null;
  is_super_admin?: boolean;
  // Task 8: account enable/disable state (internal/api SetUserStatusHandler).
  status?: UserStatus;
  tenant_id: number | null;
  // GT-11960: the backend has always SELECTed and returned these (see
  // storage.ListUsers), but the type never declared them, so the 姓名 / 邮箱 /
  // 最后登录时间 columns had nothing to render. They are `omitempty` on the Go
  // side, so every one of them can be absent.
  name?: string;
  email?: string;
  phone?: string;
  last_login_at?: string | null;
  last_login_ip?: string;
  must_change_password?: boolean;
  password_changed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Task 8: derived per-request from active admin_sessions (internal/models.User.Online,
  // not a persisted column); ListUsers/ListTenantUsers always populate it, GetUserByID
  // does not (see internal/api/users.go GetUserByID — no OnlineUserIDs lookup there).
  online?: boolean;
}

// TenantUser is the /tenant-users response shape (internal/api tenantUserResponse):
// the same User fields plus a display-only roleName resolved server-side.
export interface TenantUser extends User {
  roleName?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  // Role is optional now — role_id is authoritative server-side
  // (internal/api resolveRoleID); a supplied role must agree with the role_id
  // it derives or the request is rejected.
  role?: 'system_admin' | 'tenant_admin';
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
  role?: 'system_admin' | 'tenant_admin';
  role_id?: number;
  tenant_id?: number;
  must_change_password?: boolean;
  name?: string;
  phone?: string;
  email?: string;
}

// BulkUsersAction mirrors bulkUsersRequest.Action (internal/api/users.go):
// POST /users/bulk (and the tenant-users mirror) accept exactly these three.
export type BulkUsersAction = 'enable' | 'disable' | 'delete';

export type UserRole = 'system_admin' | 'tenant_admin';

export interface LoginRequest {
  username: string;
  password: string;
  captcha_id?: string;
  captcha_answer?: string;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  role: UserRole;
  tenant_id: number | null;
  features?: {
    ai_interpret?: boolean;
  };
  // Plan C Task 1 (internal/models.LoginResponse.RoleID/IsSuperAdmin): let the
  // frontend derive fine-grained RBAC-matrix permissions instead of the
  // coarse `role` string above, which is shared by every platform-scoped
  // account (system_admin covers both super_admin and platform_auditor role
  // codes). role_id is `omitempty` server-side — absent/null for a
  // legacy/unassigned account, in which case is_super_admin is always false.
  role_id?: number | null;
  is_super_admin?: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  expiresAt: string | null;
  selectedTenantId: number | null;
}
