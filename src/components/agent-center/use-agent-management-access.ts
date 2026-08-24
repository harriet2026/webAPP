'use client';

import { useAuth } from '@/contexts/auth-context';
import { useMyRole, type Role } from '@/lib/api/roles';
import { isDemoSessionEnabled } from '@/lib/mock/storage';
import { useAgentFeatureAccess } from './use-agent-feature-access';

export type AgentManagementAccessStatus = 'loading' | 'ready' | 'error';

export interface AgentManagementAccess {
  status: AgentManagementAccessStatus;
  canView: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

interface RoleAccess {
  canView: boolean;
  canEdit: boolean;
}

export interface AgentManagementRoleAccess extends RoleAccess {
  status: AgentManagementAccessStatus;
}

const DENIED: RoleAccess = { canView: false, canEdit: false };

function accessForRole(role: Role | null | undefined, isTrueSuperAdmin: boolean): RoleAccess {
  if (!role || role.status !== 'normal') return DENIED;
  if (isTrueSuperAdmin && role.isSuperAdmin === true) return { canView: true, canEdit: true };

  // Temporary compatibility for immutable built-in templates. Delete this
  // branch once complete built-in matrices and one authoritative authorization
  // decision path replace the quick fix documented in the 2026-08-21 spec.
  if (role.isSystemDefault === true) {
    if (role.code === 'tenant_ops') return { canView: true, canEdit: true };
    if (role.code === 'tenant_auditor' || role.code === 'platform_auditor') {
      return { canView: true, canEdit: false };
    }
  }

  const row = role.permissions?.find((permission) => permission.submoduleId === 'agent-management');
  const canView = row?.visible === true && row.canView === true;
  return { canView, canEdit: canView && row?.canEdit === true };
}

export function useAgentManagementRoleAccess(): AgentManagementRoleAccess {
  const { user, isTrueSuperAdmin } = useAuth();
  const roleQuery = useMyRole();

  if (user?.role_id != null && roleQuery.isPending) {
    return { status: 'loading', canView: false, canEdit: false };
  }
  if (roleQuery.isError) {
    return { status: 'error', canView: false, canEdit: false };
  }

  const demoSuper = isDemoSessionEnabled() && isTrueSuperAdmin;
  const roleAccess = demoSuper
    ? { canView: true, canEdit: true }
    : accessForRole(roleQuery.isSuccess ? roleQuery.data : undefined, isTrueSuperAdmin);
  return { status: 'ready', ...roleAccess };
}

export function useAgentManagementAccess(featureId: string): AgentManagementAccess {
  const product = useAgentFeatureAccess(featureId);
  const role = useAgentManagementRoleAccess();

  if (product.status === 'loading' || role.status === 'loading') {
    return { status: 'loading', canView: false, canEdit: false, readOnly: false };
  }
  if (role.status === 'error') {
    return { status: 'error', canView: false, canEdit: false, readOnly: false };
  }

  const canView = product.canView && role.canView;
  const canEdit = product.canEdit && role.canEdit;
  return { status: 'ready', canView, canEdit, readOnly: !canEdit };
}
