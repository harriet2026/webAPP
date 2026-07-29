import { describe, it, expect } from 'vitest';
import { sidebarNavItems } from '@/lib/constants';
import {
  PERM_MODULES,
  ALL_SUB_MODULES,
  getScopedModules,
  rbacSubmodulesForScope,
  visibleModulesForScope,
  findSubModule,
  subIdsOfModules,
  SUBMODULE_ROUTE_MAP,
  submoduleForHref,
  ADVANCE_EXCLUDED_ROUTES,
  ADVANCE_EXCLUDED_NAV_IDS,
  isAdvanceExcluded,
  PLATFORM_ONLY_MODULE_KEYS,
  TENANT_ONLY_MODULE_KEYS,
} from './rbac-modules';
import { FALLBACK_FEATURE_REGISTRY } from '@/lib/product-form/fallback-registry';
import { capabilitiesForForm } from '@/lib/product-form/resolve';
import { visibleNavIds, isItemVisibleByForm } from '@/components/layout/sidebar-visibility';

/** Build the SAME product-form submodule gate RoleDrawer uses, for a given form/viewer. */
function formGate(form: string, viewer: 'platform' | 'tenant') {
  const caps = capabilitiesForForm(form);
  const visible = new Set(visibleNavIds(FALLBACK_FEATURE_REGISTRY, caps, viewer, []));
  return (subId: string) =>
    isItemVisibleByForm({ id: subId, href: SUBMODULE_ROUTE_MAP[subId]?.href }, FALLBACK_FEATURE_REGISTRY, visible);
}

describe('rbac module mapping (spec §7.4)', () => {
  it('platform scope excludes tenant-only modules; tenant excludes platform-only', () => {
    const plat = getScopedModules('platform').map((m) => m.key);
    const ten = getScopedModules('tenant').map((m) => m.key);
    for (const k of TENANT_ONLY_MODULE_KEYS) expect(plat).not.toContain(k);
    for (const k of PLATFORM_ONLY_MODULE_KEYS) expect(ten).not.toContain(k);
    // and the opposite direction is preserved (nothing over-filtered)
    for (const k of PLATFORM_ONLY_MODULE_KEYS) expect(plat).toContain(k);
    for (const k of TENANT_ONLY_MODULE_KEYS) expect(ten).toContain(k);
  });

  it('rbacSubmodulesForScope applies the same platform/tenant filtering as getScopedModules', () => {
    const platIds = rbacSubmodulesForScope('platform').map((s) => s.id);
    const tenIds = rbacSubmodulesForScope('tenant').map((s) => s.id);
    const platOnlySubIds = new Set(subIdsOfModules(PLATFORM_ONLY_MODULE_KEYS));
    const tenantOnlySubIds = new Set(subIdsOfModules(TENANT_ONLY_MODULE_KEYS));
    for (const id of tenantOnlySubIds) expect(platIds).not.toContain(id);
    for (const id of platOnlySubIds) expect(tenIds).not.toContain(id);
    // sanity: both scopes are non-empty and share the common (non-exclusive) modules
    expect(platIds.length).toBeGreaterThan(0);
    expect(tenIds.length).toBeGreaterThan(0);
    expect(platIds).toContain('disposal-center');
    expect(tenIds).toContain('disposal-center');
  });

  it('every submodule id has a route-map entry (single source of truth)', () => {
    for (const m of PERM_MODULES) {
      for (const s of m.children) {
        expect(SUBMODULE_ROUTE_MAP).toHaveProperty(s.id);
      }
    }
    // and nothing in the map dangles a submodule id that doesn't exist
    for (const id of Object.keys(SUBMODULE_ROUTE_MAP)) {
      expect(findSubModule(id)).toBeDefined();
    }
  });

  it('INVARIANT: every matrix submodule maps to a real webapp page (non-empty href)', () => {
    // The matrix must not carry pageless demo concepts — a role can only be
    // granted permissions it can actually exercise. This guards against a
    // future edit reintroducing a submodule with an empty route() entry.
    for (const m of PERM_MODULES) {
      for (const s of m.children) {
        const entry = SUBMODULE_ROUTE_MAP[s.id];
        expect(entry, `submodule "${s.id}" missing route entry`).toBeDefined();
        expect(
          typeof entry.href === 'string' && entry.href.length > 0,
          `submodule "${s.id}" has no page href — it must be removed from the matrix`,
        ).toBe(true);
      }
    }
  });

  it('pageless demo modules 举报中心/高管保护 are removed from the matrix entirely', () => {
    const keys = PERM_MODULES.map((m) => m.key);
    expect(keys).not.toContain('report');
    expect(keys).not.toContain('executive');
    // executive is no longer a tenant-only module key either
    expect(TENANT_ONLY_MODULE_KEYS).not.toContain('executive');
    // and their submodule ids resolve to nothing
    for (const id of ['report-management', 'executive-dashboard', 'grey-mail-policy', 'network']) {
      expect(findSubModule(id)).toBeUndefined();
      expect(SUBMODULE_ROUTE_MAP).not.toHaveProperty(id);
    }
  });

  it('系统状态 is a standalone module (both scopes), split out of 监控中心', () => {
    const sysStatus = PERM_MODULES.find((m) => m.key === 'systemStatus');
    expect(sysStatus).toBeDefined();
    expect(sysStatus!.children.map((c) => c.id)).toEqual(['system-status']);
    expect(SUBMODULE_ROUTE_MAP['system-status'].href).toBe('/dashboard');
    // visible to BOTH scopes
    expect(getScopedModules('platform').map((m) => m.key)).toContain('systemStatus');
    expect(getScopedModules('tenant').map((m) => m.key)).toContain('systemStatus');
    // 监控中心 no longer carries the SYSTEM STATUS page (/dashboard): its own
    // first child `monitor-dashboard` is 监控总览 (/monitoring/dashboard), a
    // different page. No monitor child may point at /dashboard.
    const monitor = PERM_MODULES.find((m) => m.key === 'monitor')!;
    expect(monitor.children.some((c) => SUBMODULE_ROUTE_MAP[c.id].href === '/dashboard')).toBe(false);
    expect(SUBMODULE_ROUTE_MAP['monitor-dashboard'].href).toBe('/monitoring/dashboard');
  });

  it('监控中心 is platform-only (its /monitoring/* pages are gated from tenants)', () => {
    expect(PLATFORM_ONLY_MODULE_KEYS).toContain('monitor');
    expect(getScopedModules('tenant').map((m) => m.key)).not.toContain('monitor');
    expect(getScopedModules('platform').map((m) => m.key)).toContain('monitor');
  });

  it('组织与成员 is a standalone module visible to both scopes (not under platform-only 系统管理)', () => {
    const org = PERM_MODULES.find((m) => m.key === 'organization');
    expect(org).toBeDefined();
    expect(org!.children.map((c) => c.id)).toEqual(['contacts']);
    expect(SUBMODULE_ROUTE_MAP['contacts'].href).toBe('/organization-contacts');
    // tenant admin must see it; platform admin too
    expect(getScopedModules('tenant').map((m) => m.key)).toContain('organization');
    expect(getScopedModules('platform').map((m) => m.key)).toContain('organization');
    // contacts is no longer a child of the platform-only system module
    const system = PERM_MODULES.find((m) => m.key === 'system')!;
    expect(system.children.map((c) => c.id)).not.toContain('contacts');
  });

  it('platform matrix now includes the 5 previously-missing platform pages', () => {
    // A-class fix: pages that exist in the platform nav but had no matrix entry.
    const platformSubIds = getScopedModules('platform').flatMap((m) => m.children.map((c) => c.id));
    for (const id of ['monitor-dashboard', 'proxysvr', 'system-dkim', 'password-policy', 'smtp-credentials']) {
      expect(platformSubIds).toContain(id);
    }
    // each maps to its real platform page
    expect(SUBMODULE_ROUTE_MAP['proxysvr'].href).toBe('/system/proxysvr');
    expect(SUBMODULE_ROUTE_MAP['system-dkim'].href).toBe('/system/dkim');
    expect(SUBMODULE_ROUTE_MAP['password-policy'].href).toBe('/system/password-policy');
    expect(SUBMODULE_ROUTE_MAP['smtp-credentials'].href).toBe('/smtp-credentials');
  });

  describe('visibleModulesForScope aligns the matrix to the current product form', () => {
    it('drops SINGLE_ONLY forwarding in multi-tenant, keeps it in single-tenant (platform view)', () => {
      const subIds = (form: string) =>
        visibleModulesForScope('platform', formGate(form, 'platform')).flatMap((m) => m.children.map((c) => c.id));
      // multi-tenant forms: 邮件路由 not in nav → not assignable
      for (const form of ['cloud', 'ai-multi', 'legacy-multi']) {
        expect(subIds(form)).not.toContain('forwarding');
      }
      // single-tenant: 邮件路由 exists → assignable
      expect(subIds('ai-single')).toContain('forwarding');
    });

    it('drops MULTI_ONLY platform-security-policy/tenant-management in single-tenant', () => {
      const single = visibleModulesForScope('platform', formGate('ai-single', 'platform')).flatMap((m) =>
        m.children.map((c) => c.id),
      );
      expect(single).not.toContain('platform-security-policy');
      expect(single).not.toContain('tenant-management');
      const multi = visibleModulesForScope('platform', formGate('ai-multi', 'platform')).flatMap((m) =>
        m.children.map((c) => c.id),
      );
      expect(multi).toContain('platform-security-policy');
      expect(multi).toContain('tenant-management');
    });

    it('keeps the 4 ALWAYS platform system pages across all forms (platform view)', () => {
      for (const form of ['cloud', 'ai-multi', 'legacy-multi', 'ai-single', 'legacy-single']) {
        const subIds = visibleModulesForScope('platform', formGate(form, 'platform')).flatMap((m) =>
          m.children.map((c) => c.id),
        );
        for (const id of ['proxysvr', 'system-dkim', 'password-policy', 'smtp-credentials']) {
          expect(subIds).toContain(id);
        }
      }
    });

    it('collapses a module whose children are all form-hidden', () => {
      // predicate that hides every system child → system module disappears
      const gate = (subId: string) => !subIdsOfModules(['system']).includes(subId);
      const keys = visibleModulesForScope('platform', gate).map((m) => m.key);
      expect(keys).not.toContain('system');
      // other modules survive
      expect(keys).toContain('statistics');
    });

    it('is a no-op when the predicate allows everything (equals getScopedModules)', () => {
      const all = visibleModulesForScope('platform', () => true);
      expect(all.map((m) => m.key)).toEqual(getScopedModules('platform').map((m) => m.key));
    });

    it('REGRESSION: platform-role matrix uses the platform viewer, never the logged-in tenant viewer', () => {
      // A platform admin impersonating a tenant still edits PLATFORM roles; the
      // form gate must resolve with the 'platform' viewer. Using the caller's
      // 'tenant' viewer would mark every platform-only page (proxysvr, DKIM,
      // tenant-management …) invisible and collapse the whole 系统管理 group.
      const withPlatformViewer = visibleModulesForScope('platform', formGate('ai-multi', 'platform'));
      const system = withPlatformViewer.find((m) => m.key === 'system');
      expect(system, '系统管理 must survive under platform viewer').toBeDefined();
      expect(system!.children.map((c) => c.id)).toContain('proxysvr');

      // Prove the bug the fix prevents: the WRONG viewer collapses 系统管理.
      const withTenantViewer = visibleModulesForScope('platform', formGate('ai-multi', 'tenant'));
      expect(withTenantViewer.some((m) => m.key === 'system')).toBe(false);
    });
  });

  it('reverse lookup resolves a known route back to its submodule id', () => {
    // disposal-center → /email-disposal/center (see sidebar constants)
    expect(submoduleForHref('/email-disposal/center')).toBe('disposal-center');
    expect(submoduleForHref('/statistics/security-overview')).toBe('security-overview');
    expect(submoduleForHref('/route/that/does/not/exist')).toBeUndefined();
  });

  it('the users page is shared by admin-account, role-permission and login-security', () => {
    expect(SUBMODULE_ROUTE_MAP['admin-account'].href).toBe('/users');
    expect(SUBMODULE_ROUTE_MAP['role-permission'].href).toBe('/users');
    expect(SUBMODULE_ROUTE_MAP['login-security'].href).toBe('/users');
  });

  it('ADVANCE-gated nav groups (advanced-rules, mail) are hard-excluded from the matrix source', () => {
    // Per constants.ts, both 'advanced-rules' and 'mail' top-level groups carry
    // requiresAdvancedRules: true, and gate their entire subtree (sidebar-nav.tsx
    // short-circuits rendering of the parent, so children inherit the gate even
    // though only the group node itself sets the flag).
    expect(isAdvanceExcluded('advanced-rules')).toBe(true);
    expect(isAdvanceExcluded('mail')).toBe(true);
    // a few representative leaves under those groups must also be excluded
    for (const id of ['rule-pipeline', 'route-rules', 'rbl', 'password-book', 'audit-queue', 'quarantine', 'sideline', 'inbound-audit']) {
      expect(isAdvanceExcluded(id)).toBe(true);
    }
    // and a non-advance group must not be excluded
    expect(isAdvanceExcluded('email-disposal')).toBe(false);
    expect(isAdvanceExcluded('disposal-center')).toBe(false);

    // No RBAC submodule route/featureId may point at an advance-excluded route —
    // this is the hard filter demanded by spec §7.5. Currently true by
    // construction (the demo's PERM_MODULES simply doesn't model those pages),
    // but the assertion guards against a future submodule silently reusing one.
    for (const entry of Object.values(SUBMODULE_ROUTE_MAP)) {
      if (entry.href) expect(ADVANCE_EXCLUDED_ROUTES).not.toContain(entry.href);
    }
  });

  it('ADVANCE_EXCLUDED_ROUTES/NAV_IDS are derived from sidebarNavItems, not hardcoded twice', () => {
    // every route under the two requiresAdvancedRules groups in constants.ts
    // must show up in the derived exclusion set
    const advancedGroup = sidebarNavItems.find((i) => i.id === 'advanced-rules')!;
    expect(advancedGroup.requiresAdvancedRules).toBe(true);
    const mailGroup = sidebarNavItems.find((i) => i.id === 'mail')!;
    expect(mailGroup.requiresAdvancedRules).toBe(true);
    expect(ADVANCE_EXCLUDED_ROUTES).toContain('/rules/pipeline');
    expect(ADVANCE_EXCLUDED_ROUTES).toContain('/audit-queue');
    expect(ADVANCE_EXCLUDED_NAV_IDS).toContain('rule-pipeline');
    expect(ADVANCE_EXCLUDED_NAV_IDS).toContain('sideline');
  });

  it('ALL_SUB_MODULES stays in sync with PERM_MODULES children', () => {
    const flat = PERM_MODULES.flatMap((m) => m.children.map((c) => c.id));
    expect(ALL_SUB_MODULES.map((s) => s.id)).toEqual(flat);
  });
});
