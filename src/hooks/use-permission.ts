import { useAuth } from '@/contexts/auth-context';

export function usePermission() {
  const { user, hasPermission, isSystemAdmin, isTrueSuperAdmin } = useAuth();

  return {
    isSystemAdmin,
    isTenantAdmin: user?.role === 'tenant_admin',
    // Plan C Task 5: `hasPermission` below is now backed by the account's own
    // role-matrix, not the coarse `role` string — a non-super `system_admin`
    // (e.g. platform_auditor) no longer inherits every permission just from
    // the string. `isTrueSuperAdmin` is exposed here too for callers that
    // need the unconditional "real super admin" signal directly rather than
    // via a specific permission check.
    isTrueSuperAdmin,
    canManageTagRules: true,
    canManageStageRules: true,
    canManageTenants: hasPermission('manage_tenants'),
    canManageUsers: hasPermission('manage_users'),
    // GT-11959: held by BOTH roles. A tenant admin has no manage_users, so this is
    // the only thing that gets them onto /users at all.
    canManageLoginSecurity: hasPermission('manage_login_security'),
    // Plan C Task 7: gates the /users 角色权限 tab (role-permission submodule).
    canManageRoles: hasPermission('manage_roles'),
    canViewAuthAttempts: hasPermission('view_auth_attempts'),
    canViewAdminAuditLogs: hasPermission('view_admin_audit_logs'),
    canManageSMTPCredentials: true,
    canViewEmailLogs: true,
  };
}
