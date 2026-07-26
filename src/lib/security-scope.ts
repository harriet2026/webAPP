export type Viewer = 'platform' | 'tenant';

export interface SecurityScopeInput {
  scopeTenantId: number | null;
  multiTenant: boolean;
  capabilitiesLoaded: boolean;
  viewer: Viewer;
  isSystemAdmin: boolean;
  // GT: identity of a REAL tenant admin (user.role === 'tenant_admin'). This is
  // NOT the same as `viewer === 'tenant'`: a platform admin can also carry the
  // tenant viewer. A tenant admin is scoped to their own tenant by identity and
  // must never be normalized up to the platform viewer, regardless of the other
  // flags below.
  isTenantAdmin: boolean;
  selectedTenantId: number | null;
  userTenantId: number | null;
}

export interface SecurityScope {
  effectiveViewer: Viewer;
  scopeActive: boolean;
  scopeResolved: boolean;
  resolvedScopeTenant: number | null;
}

// spec §3.1 / §4.2: normalize the inconsistent "platform admin + viewer=tenant +
// no selected tenant" state to platform, so the selector shows and we don't
// silently serve all-tenant data while hiding the scope picker.
//
// GT-cloud-gateway fix: the normalization above is only meant to repair a
// PLATFORM admin's inconsistent viewer selection. It must fire ONLY for an
// account that has no home tenant of its own (`userTenantId == null`), i.e. a
// true global platform admin. Two kinds of tenant-bound accounts must never be
// promoted to the platform viewer, or the platform-only cards
// (系统在线节点 / 系统与服务健康) leak into the tenant view in the cloud-gateway
// (saas + multiTenant) form:
//   1. a real tenant admin (`isTenantAdmin`), and
//   2. any account bound to a specific tenant (`userTenantId != null`) that
//      happens to also read `isSystemAdmin` (e.g. a tenant-scoped system role).
// Confining the flip to `userTenantId == null` keeps this single source of
// truth in lockstep with the product-form-context clamp and the backend, which
// scopes such accounts to their own tenant regardless of the viewer toggle.
export function resolveSecurityScope(i: SecurityScopeInput): SecurityScope {
  const isTenantBound = i.isTenantAdmin || i.userTenantId != null;
  const effectiveViewer: Viewer = isTenantBound
    ? 'tenant'
    : i.viewer === 'tenant' && i.isSystemAdmin && i.selectedTenantId == null
      ? 'platform'
      : i.viewer;

  const scopeActive = i.multiTenant && effectiveViewer === 'platform';
  const scopeResolved = i.capabilitiesLoaded;

  // Any tenant-bound account (real tenant admin, or a system role that still
  // carries a home tenant) is confined to its own JWT tenant. Resolve that by
  // identity BEFORE the isSystemAdmin branch, so such an account is not scoped
  // to selectedTenantId (null for them, i.e. all-tenants) and cannot leak
  // cross-tenant data. Only a true global platform admin (no home tenant) uses
  // the impersonation selectedTenantId.
  const resolvedScopeTenant = scopeActive
    ? i.scopeTenantId
    : isTenantBound
      ? i.userTenantId ?? null
      : i.isSystemAdmin
        ? i.selectedTenantId
        : i.userTenantId ?? null;

  return { effectiveViewer, scopeActive, scopeResolved, resolvedScopeTenant };
}
