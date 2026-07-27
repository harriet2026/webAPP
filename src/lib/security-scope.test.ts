import { describe, it, expect } from 'vitest';
import { resolveSecurityScope } from './security-scope';

const base = {
  scopeTenantId: null,
  multiTenant: true,
  capabilitiesLoaded: true,
  viewer: 'platform' as const,
  isSystemAdmin: true,
  isTenantAdmin: false,
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
      ...base, isSystemAdmin: false, isTenantAdmin: true, viewer: 'tenant', userTenantId: 4, multiTenant: true,
    });
    expect(s.effectiveViewer).toBe('tenant');
    expect(s.scopeActive).toBe(false);
    expect(s.resolvedScopeTenant).toBe(4);
  });

  // GT-cloud-gateway regression: in a cloud-gateway / multi-tenant form a real
  // tenant admin can also carry isSystemAdmin + viewer=tenant + no selected
  // tenant. The old normalization flipped that to 'platform' and leaked the
  // platform-only infra cards (系统在线节点 / 系统与服务健康) into the tenant
  // view. Tenant-admin identity must pin effectiveViewer to 'tenant'.
  it('tenant_admin is never promoted to platform even when isSystemAdmin + no selected tenant', () => {
    const s = resolveSecurityScope({
      ...base,
      isTenantAdmin: true,
      isSystemAdmin: true,
      viewer: 'tenant',
      selectedTenantId: null,
      userTenantId: 7,
      multiTenant: true,
    });
    expect(s.effectiveViewer).toBe('tenant');
    expect(s.scopeActive).toBe(false);
    expect(s.resolvedScopeTenant).toBe(7);
  });

  // GT-cloud-gateway regression #2: an account that is NOT role=tenant_admin
  // but is still bound to a home tenant (userTenantId != null) — e.g. a
  // tenant-scoped system role in the cloud-gateway form — also reads
  // isSystemAdmin. The `role === 'tenant_admin'` short-circuit alone did not
  // cover it, so the normalization still flipped it to 'platform' and the
  // infra cards leaked. Any tenant-bound account must pin to 'tenant' and its
  // own JWT tenant, never the impersonation selectedTenantId.
  it('tenant-bound system account (userTenantId set) is never promoted to platform', () => {
    const s = resolveSecurityScope({
      ...base,
      isTenantAdmin: false,
      isSystemAdmin: true,
      viewer: 'tenant',
      selectedTenantId: null,
      userTenantId: 3,
      multiTenant: true,
    });
    expect(s.effectiveViewer).toBe('tenant');
    expect(s.scopeActive).toBe(false);
    expect(s.resolvedScopeTenant).toBe(3);
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
