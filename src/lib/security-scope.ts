export type Viewer = 'platform' | 'tenant';

export interface SecurityScopeInput {
  scopeTenantId: number | null;
  multiTenant: boolean;
  capabilitiesLoaded: boolean;
  viewer: Viewer;
  isSystemAdmin: boolean;
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
export function resolveSecurityScope(i: SecurityScopeInput): SecurityScope {
  const effectiveViewer: Viewer =
    i.viewer === 'tenant' && i.isSystemAdmin && i.selectedTenantId == null
      ? 'platform'
      : i.viewer;

  const scopeActive = i.multiTenant && effectiveViewer === 'platform';
  const scopeResolved = i.capabilitiesLoaded;

  const resolvedScopeTenant = scopeActive
    ? i.scopeTenantId
    : i.isSystemAdmin
      ? i.selectedTenantId
      : i.userTenantId ?? null;

  return { effectiveViewer, scopeActive, scopeResolved, resolvedScopeTenant };
}
