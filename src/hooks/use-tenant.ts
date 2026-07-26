import { useAuth } from '@/contexts/auth-context';

export function useTenant() {
  const { user, selectedTenantId, setSelectedTenant, isSystemAdmin } = useAuth();

  const effectiveTenantId = isSystemAdmin ? selectedTenantId : user?.tenant_id;
  const isAdmin = isSystemAdmin || user?.role === 'tenant_admin';

  return {
    selectedTenantId,
    effectiveTenantId,
    setSelectedTenant,
    isSystemAdmin,
    isAdmin,
    isViewingAllTenants: isSystemAdmin && selectedTenantId === null,
  };
}
