'use client';

import { useProductForm } from '@/contexts/product-form-context';
import { useAuth } from '@/contexts/auth-context';
import { resolve } from '@/lib/product-form/resolve';

export function useSpoofingAccess() {
  const { capabilities, registry, viewer, grants } = useProductForm();
  const { isSystemAdmin, selectedTenantId } = useAuth();
  const feature = registry.find((item) => item.id === 'spoofing-detection');
  if (!capabilities || !feature) {
    return { canEdit: false, readOnly: true };
  }
  const bypassTenantGrant = isSystemAdmin && selectedTenantId !== null;
  const effectiveGrants = bypassTenantGrant
    ? [...new Set([...grants, feature.id])]
    : grants;
  const access = resolve(feature, capabilities, bypassTenantGrant ? 'tenant' : viewer, effectiveGrants);
  return { canEdit: access.canEdit, readOnly: !access.canEdit };
}
