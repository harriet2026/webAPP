import { describe, it, expect } from 'vitest';
import { capabilitiesForForm } from '@/lib/product-form/resolve';
import {
  isItemVisibleByRole,
  isNavItemAllowed,
  type NavGateContext,
} from './sidebar-visibility';

describe('isItemVisibleByRole (Plan C Task 6, spec §7.2)', () => {
  // Non-super role: only allows the one route registered to its granted submodule.
  const onlySecurityOverview = (href: string) => href === '/statistics/security-overview';

  it('is visible when canSeeRoute grants the item href', () => {
    expect(isItemVisibleByRole({ id: 'security-overview', href: '/statistics/security-overview' }, onlySecurityOverview)).toBe(true);
  });

  it('is hidden when canSeeRoute denies a registered item href', () => {
    expect(isItemVisibleByRole({ id: 'tenants', href: '/tenants' }, onlySecurityOverview)).toBe(false);
  });

  it('is additive (visible) for a parent group with no href, regardless of canSeeRoute', () => {
    expect(isItemVisibleByRole({ id: 'system' }, onlySecurityOverview)).toBe(true);
    const denyEverything = () => false;
    expect(isItemVisibleByRole({ id: 'system' }, denyEverything)).toBe(true);
  });

  it('is additive (visible) for an advance-gated / unregistered href, since canSeeRoute itself default-allows those (spec §7.5)', () => {
    // canSeeRoute is defined (Task 5) to return true for any href with no
    // registered RBAC submodule, which includes every requiresAdvancedRules
    // route (they are hard-excluded from the matrix, never registered) as
    // well as routes simply not yet mapped. Model that contract directly
    // rather than re-deriving it, since isItemVisibleByRole only consumes
    // canSeeRoute and must not re-implement its "unregistered" logic.
    const canSeeRouteAdditive = (href: string) => href === '/statistics/security-overview' || href === '/rules/pipeline';
    expect(isItemVisibleByRole({ id: 'rule-pipeline', href: '/rules/pipeline' }, canSeeRouteAdditive)).toBe(true);
  });

  it('true super admin canSeeRoute (unconditional true) makes every href item visible', () => {
    const trueSuperCanSeeRoute = () => true;
    expect(isItemVisibleByRole({ id: 'tenants', href: '/tenants' }, trueSuperCanSeeRoute)).toBe(true);
    expect(isItemVisibleByRole({ id: 'users', href: '/users' }, trueSuperCanSeeRoute)).toBe(true);
  });
});

const allowAllContext: NavGateContext = {
  hasPermission: () => true,
  isSystemAdmin: true,
  showAdvancedRules: true,
  canSeeRoute: () => true,
  registry: [],
  formVisible: null,
  switcherEnabled: true,
};

describe('isNavItemAllowed — product-form switcher gate', () => {
  const logsGroup = { id: 'logs', requiresProductFormSwitcher: true };

  it('hides switcher-only groups when the product-form switcher is disabled', () => {
    expect(isNavItemAllowed(logsGroup, { ...allowAllContext, switcherEnabled: false })).toBe(false);
  });

  it('shows switcher-only groups when the product-form switcher is enabled', () => {
    expect(isNavItemAllowed(logsGroup, allowAllContext)).toBe(true);
  });

  it('does not hide ordinary groups when the product-form switcher is disabled', () => {
    expect(isNavItemAllowed({ id: 'statistics' }, { ...allowAllContext, switcherEnabled: false })).toBe(true);
  });
});

describe('isNavItemAllowed — multi-tenant tenant-view pruning', () => {
  const tenantContext: NavGateContext = {
    ...allowAllContext,
    capabilities: capabilitiesForForm('ai-multi'),
    viewer: 'tenant',
  };

  it('hides every monitoring-center child route', () => {
    for (const href of [
      '/monitoring/dashboard',
      '/monitoring/infrastructure',
      '/monitoring/mailflow',
      '/monitoring/security',
      '/monitoring/alerts',
    ]) {
      expect(isNavItemAllowed({ id: href, href }, tenantContext)).toBe(false);
    }
  });

  it('keeps only users and organization contacts in Organization & members', () => {
    for (const href of ['/users', '/organization-contacts']) {
      expect(isNavItemAllowed({ id: href, href }, tenantContext)).toBe(true);
    }

    for (const href of [
      '/mail-routing',
      '/tenants',
      '/system/proxysvr',
      '/system/dkim',
      '/system/platform-security',
      '/system/password-policy',
      '/smtp-credentials',
    ]) {
      expect(isNavItemAllowed({ id: href, href }, tenantContext)).toBe(false);
    }
  });

  it('does not apply tenant-view pruning to platform view or single-tenant forms', () => {
    const monitoring = { id: 'monitor-dashboard', href: '/monitoring/dashboard' };
    const tenantManagement = { id: 'tenants', href: '/tenants' };
    const platformContext: NavGateContext = {
      ...tenantContext,
      viewer: 'platform',
    };
    const singleTenantContext: NavGateContext = {
      ...tenantContext,
      capabilities: capabilitiesForForm('ai-single'),
    };

    expect(isNavItemAllowed(monitoring, platformContext)).toBe(true);
    expect(isNavItemAllowed(tenantManagement, platformContext)).toBe(true);
    expect(isNavItemAllowed(monitoring, singleTenantContext)).toBe(true);
    expect(isNavItemAllowed(tenantManagement, singleTenantContext)).toBe(true);
  });
});
