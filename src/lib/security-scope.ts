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
// PLATFORM admin's inconsistent viewer selection. A real tenant admin must
// never be promoted to the platform viewer — in a cloud-gateway / multi-tenant
// form their account may also read `isSystemAdmin`, so the old rule flipped them
// to 'platform' and leaked platform-only cards (系统在线节点 / 系统与服务健康)
// into the tenant view. Short-circuit tenant-admin identity to the tenant viewer
// so this single source of truth matches the product-form-context clamp.
export function resolveSecurityScope(i: SecurityScopeInput): SecurityScope {
  const effectiveViewer: Viewer = i.isTenantAdmin
    ? 'tenant'
    : i.viewer === 'tenant' && i.isSystemAdmin && i.selectedTenantId == null
      ? 'platform'
      : i.viewer;

  const scopeActive = i.multiTenant && effectiveViewer === 'platform';
  const scopeResolved = i.capabilitiesLoaded;

  // A tenant admin is always confined to their own JWT tenant. Resolve that by
  // identity BEFORE the isSystemAdmin branch, so a cloud-gateway tenant admin
  // that also reads isSystemAdmin is not scoped to selectedTenantId (which is
  // null for them, i.e. all-tenants) and does not leak cross-tenant data.
  const resolvedScopeTenant = scopeActive
    ? i.scopeTenantId
    : i.isTenantAdmin
      ? i.userTenantId ?? null
      : i.isSystemAdmin
        ? i.selectedTenantId
        : i.userTenantId ?? null;

  return { effectiveViewer, scopeActive, scopeResolved, resolvedScopeTenant };
}
