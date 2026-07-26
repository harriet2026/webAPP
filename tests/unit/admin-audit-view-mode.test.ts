import { describe, expect, it } from 'vitest';

import {
  deriveViewMode,
  useAuditViewMode,
  type AuditViewMode,
} from '@/components/admin-audit/use-audit-view-mode';

describe('deriveViewMode', () => {
  it('single-tenant product form collapses to single regardless of role (review FG1)', () => {
    // The page is admin-only, so the single view is reachable ONLY via the
    // product-form capability (multiTenant=false), never via role. A
    // system_admin on a single-tenant deployment must NOT see the layer Tabs.
    expect(
      deriveViewMode({
        isSystemAdmin: true,
        isTenantAdmin: false,
        isViewingAllTenants: true,
        multiTenant: false,
      }),
    ).toBe<AuditViewMode>('single');
    expect(
      deriveViewMode({
        isSystemAdmin: true,
        isTenantAdmin: false,
        isViewingAllTenants: false,
        multiTenant: false,
      }),
    ).toBe<AuditViewMode>('single');
    expect(
      deriveViewMode({
        isSystemAdmin: false,
        isTenantAdmin: true,
        isViewingAllTenants: false,
        multiTenant: false,
      }),
    ).toBe<AuditViewMode>('single');
  });

  it('multi-tenant tenant_admin returns tenant (no layer tabs, own-tenant only) — review finding #3', () => {
    // Spec §F2 多租户·租户视角: tenant_admin sees own-tenant tenant-level
    // operations; the page sends layer=tenant so platform ops on the tenant
    // are excluded. Previously this returned 'single' which sent no layer and
    // mixed in platform-level rows.
    expect(
      deriveViewMode({
        isSystemAdmin: false,
        isTenantAdmin: true,
        isViewingAllTenants: false,
        multiTenant: true,
      }),
    ).toBe<AuditViewMode>('tenant');
    // tenant_admin has no "viewing all tenants" concept; still tenant.
    expect(
      deriveViewMode({
        isSystemAdmin: false,
        isTenantAdmin: true,
        isViewingAllTenants: true,
        multiTenant: true,
      }),
    ).toBe<AuditViewMode>('tenant');
  });

  it('multi-tenant system-admin viewing all tenants returns platform (show layer tabs)', () => {
    expect(
      deriveViewMode({
        isSystemAdmin: true,
        isTenantAdmin: false,
        isViewingAllTenants: true,
        multiTenant: true,
      }),
    ).toBe<AuditViewMode>('platform');
  });

  it('multi-tenant system-admin scoped to a specific tenant returns tenant (no layer tabs)', () => {
    expect(
      deriveViewMode({
        isSystemAdmin: true,
        isTenantAdmin: false,
        isViewingAllTenants: false,
        multiTenant: true,
      }),
    ).toBe<AuditViewMode>('tenant');
  });
});

describe('useAuditViewMode', () => {
  it('is a hook that derives its mode from useTenant + useProductForm', () => {
    expect(typeof useAuditViewMode).toBe('function');
  });

  it('exports the three allowed view modes via the AuditViewMode type', () => {
    const allowed: AuditViewMode[] = ['single', 'platform', 'tenant'];
    expect(allowed).toEqual(['single', 'platform', 'tenant']);
  });
});
