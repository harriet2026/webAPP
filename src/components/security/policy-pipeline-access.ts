import type { Viewer } from '@/lib/product-form/resolve';

export function canAccessPolicyPipeline({
  multiTenant,
  effectiveViewer,
  isSystemAdmin,
  isTenantAdmin,
  hasViewPermission,
}: {
  multiTenant: boolean;
  effectiveViewer: Viewer;
  isSystemAdmin: boolean;
  isTenantAdmin: boolean;
  hasViewPermission: boolean;
}): boolean {
  if (!hasViewPermission) return false;
  if (multiTenant && effectiveViewer === 'platform') return false;
  return isSystemAdmin || isTenantAdmin || effectiveViewer === 'tenant';
}
