import { describe, it, expect } from 'vitest';
import { isItemVisibleByRole } from './sidebar-visibility';

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
