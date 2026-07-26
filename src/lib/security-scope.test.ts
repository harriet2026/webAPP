import { describe, it, expect } from 'vitest';
import { resolveSecurityScope } from './security-scope';

const base = {
  scopeTenantId: null,
  multiTenant: true,
  capabilitiesLoaded: true,
  viewer: 'platform' as const,
  isSystemAdmin: true,
  selectedTenantId: null,
  userTenantId: null,
};

describe('resolveSecurityScope', () => {
  it('platform multi-tenant, no scope → active, all tenants', () => {
    const s = resolveSecurityScope(base);
    expect(s.scopeActive).toBe(true);
    expect(s.resolvedScopeTenant).toBeNull();
  });

  it('platform scoped to a tenant → resolved to that tenant', () => {
    const s = resolveSecurityScope({ ...base, scopeTenantId: 9 });
    expect(s.scopeActive).toBe(true);
    expect(s.resolvedScopeTenant).toBe(9);
  });

  it('single-tenant form → inactive, hidden', () => {
    const s = resolveSecurityScope({ ...base, multiTenant: false });
    expect(s.scopeActive).toBe(false);
  });

  it('tenant_admin → inactive, resolves to own JWT tenant', () => {
    const s = resolveSecurityScope({
      ...base, isSystemAdmin: false, viewer: 'tenant', userTenantId: 4, multiTenant: true,
    });
    expect(s.scopeActive).toBe(false);
    expect(s.resolvedScopeTenant).toBe(4);
  });

  it('impersonating admin (viewer=tenant + selected) → inactive, that tenant', () => {
    const s = resolveSecurityScope({ ...base, viewer: 'tenant', selectedTenantId: 6 });
    expect(s.scopeActive).toBe(false);
    expect(s.resolvedScopeTenant).toBe(6);
  });

  it('inconsistent platform (viewer=tenant + no selected) → normalized to platform', () => {
    const s = resolveSecurityScope({ ...base, viewer: 'tenant', selectedTenantId: null });
    expect(s.effectiveViewer).toBe('platform');
    expect(s.scopeActive).toBe(true);
    expect(s.resolvedScopeTenant).toBeNull();
  });

  it('capabilities not loaded → scopeResolved false', () => {
    const s = resolveSecurityScope({ ...base, capabilitiesLoaded: false });
    expect(s.scopeResolved).toBe(false);
  });
});
