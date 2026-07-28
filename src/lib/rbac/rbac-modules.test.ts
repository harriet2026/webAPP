import { describe, it, expect } from 'vitest';
import { sidebarNavItems } from '@/lib/constants';
import {
  PERM_MODULES,
  ALL_SUB_MODULES,
  getScopedModules,
  rbacSubmodulesForScope,
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
