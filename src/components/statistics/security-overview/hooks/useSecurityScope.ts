import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { useScopedApiRequest, type ApiRequestFn } from '@/lib/api/client';
import { resolveSecurityScope, type SecurityScope } from '@/lib/security-scope';

export function useSecurityScope(
  scopeTenantId: number | null,
): SecurityScope & { scopedRequest: ApiRequestFn } {
  const { isSystemAdmin, isTenantAdmin, selectedTenantId, user } = useAuth();
  const { capabilities, viewer } = useProductForm();

  const scope = resolveSecurityScope({
    scopeTenantId,
    multiTenant: capabilities?.multiTenant === true,
    capabilitiesLoaded: capabilities !== null,
    viewer,
    isSystemAdmin,
    isTenantAdmin,
    selectedTenantId,
    userTenantId: user?.tenant_id ?? null,
  });

  const { apiRequest: scopedRequest } = useScopedApiRequest(scope.resolvedScopeTenant);
  return { ...scope, scopedRequest };
}
