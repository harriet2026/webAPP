'use client';

import { useProductForm } from '@/contexts/product-form-context';
import { useAuth } from '@/contexts/auth-context';
import { resolve } from '@/lib/product-form/resolve';
import { isDemoSessionEnabled } from '@/lib/mock/storage';

export function useAgentFeatureAccess(featureId: string) {
  const { capabilities, registry, registryReady, viewer, grants } = useProductForm();
  const { isSystemAdmin, selectedTenantId } = useAuth();
  const feature = registry.find((item) => item.id === featureId);
  if (!registryReady) {
    return { status: 'loading' as const, canView: false, canEdit: false, readOnly: false };
  }
  if (!capabilities || !feature) {
    return { status: 'ready' as const, canView: false, canEdit: false, readOnly: true };
  }
  // The explicit offline demo represents a tenant-admin workspace even though
  // it has no real tenant selector or impersonation cookie. Keep this grant in
  // the access hook so mock config remains fully interactive without weakening
  // production role/access semantics.
  const demoTenantGrant = isDemoSessionEnabled();
  const bypassTenantGrant = (isSystemAdmin && selectedTenantId !== null) || demoTenantGrant;
  const effectiveGrants = bypassTenantGrant
    ? [...new Set([...grants, feature.id])]
    : grants;
  const access = resolve(feature, capabilities, bypassTenantGrant ? 'tenant' : viewer, effectiveGrants);
  const canView = access.visible && !access.locked;
  return { status: 'ready' as const, canView, canEdit: access.canEdit, readOnly: !access.canEdit };
}
