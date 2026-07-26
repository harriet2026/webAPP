import { useTenant } from '@/hooks/use-tenant';
import { useProductForm } from '@/contexts/product-form-context';

export type AuditViewMode = 'single' | 'platform' | 'tenant';

// deriveViewMode maps the product form + caller's role + tenant selection to the
// audit view mode (spec §3.1 / §F2):
//   - single    : single-tenant product form (no multiTenant capability) → no
//                 layer Tab, all auditable operations, no layer param sent.
//                 Since this page is admin-only, this branch is reachable ONLY
//                 via the form capability, not via role (review FG1).
//   - platform  : multi-tenant, system_admin viewing all tenants (layer Tab shown).
//   - tenant    : multi-tenant, system_admin drilling into one tenant OR
//                 tenant_admin (no Tab, only own-tenant tenant-level operations).
//                 The page sends layer=tenant so platform-level operations on
//                 this tenant are excluded (review finding #3).
export function deriveViewMode(p: {
  isSystemAdmin: boolean;
  isTenantAdmin: boolean;
  isViewingAllTenants: boolean;
  multiTenant: boolean;
}): AuditViewMode {
  // Single-tenant deployment: the layer Tabs (平台/租户管理员操作) are meaningless,
  // so collapse to the flat single view regardless of role (spec §3.1).
  if (!p.multiTenant) {
    return 'single';
  }
  if (p.isSystemAdmin) {
    return p.isViewingAllTenants ? 'platform' : 'tenant';
  }
  // Multi-tenant tenant_admin sees a tenant-scoped view (spec §F2 多租户·租户视角).
  if (p.isTenantAdmin) {
    return 'tenant';
  }
  return 'single';
}

export function useAuditViewMode(): AuditViewMode {
  const { isSystemAdmin, isAdmin, isViewingAllTenants } = useTenant();
  const { capabilities } = useProductForm();
  const isTenantAdmin = isAdmin && !isSystemAdmin;
  // Until the product form resolves, assume multi-tenant (matches the codebase
  // convention of not gating on a null capabilities object, e.g. tenants/page.tsx)
  // so a multi-tenant console doesn't flash the single-tenant layout on load.
  const multiTenant = capabilities ? Boolean(capabilities.multiTenant) : true;
  return deriveViewMode({
    isSystemAdmin: Boolean(isSystemAdmin),
    isTenantAdmin,
    isViewingAllTenants: Boolean(isViewingAllTenants),
    multiTenant,
  });
}
