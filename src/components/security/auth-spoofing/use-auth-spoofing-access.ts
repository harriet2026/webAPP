'use client';

import { useAuth } from '@/contexts/auth-context';
import { useMyRole, type Role } from '@/lib/api/roles';

export type AuthSpoofingAccessStatus = 'loading' | 'ready' | 'error';

export interface AuthSpoofingAccess {
  status: AuthSpoofingAccessStatus;
  canView: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

interface RoleAccess {
  canView: boolean;
  canEdit: boolean;
}

const DENIED: RoleAccess = { canView: false, canEdit: false };

/** Keep the frontend decision aligned with roleAllowsAuthSpoofingAccess. */
export function authSpoofingAccessForRole(
  role: Role | null | undefined,
  isTrueSuperAdmin: boolean,
): RoleAccess {
  if (!role || role.status !== 'normal') return DENIED;
  if (isTrueSuperAdmin && role.isSuperAdmin === true) {
    return { canView: true, canEdit: true };
  }

  // Built-in roles intentionally have no persisted matrix. Their compatibility
  // policy therefore has to be resolved from the immutable role code, exactly
  // like the backend middleware does.
  if (role.isSystemDefault === true) {
    if (role.code === 'tenant_ops') return { canView: true, canEdit: true };
    if (role.code === 'tenant_auditor' || role.code === 'platform_auditor') {
      return { canView: true, canEdit: false };
    }
  }

  const permission = role.permissions?.find(
    (item) => item.submoduleId === 'strategy-pipeline',
  );
  const canView = permission?.visible === true && permission.canView === true;
  return {
    canView,
    canEdit: canView && permission?.canEdit === true,
  };
}

export function useAuthSpoofingAccess(): AuthSpoofingAccess {
  const { user, isTrueSuperAdmin } = useAuth();
  const roleQuery = useMyRole();

  if (user?.role_id != null && roleQuery.isPending) {
    return { status: 'loading', canView: false, canEdit: false, readOnly: false };
  }
  if (roleQuery.isError) {
    return { status: 'error', canView: false, canEdit: false, readOnly: false };
  }

  const access = authSpoofingAccessForRole(
    roleQuery.isSuccess ? roleQuery.data : undefined,
    isTrueSuperAdmin,
  );
  return { status: 'ready', ...access, readOnly: access.canView && !access.canEdit };
}
