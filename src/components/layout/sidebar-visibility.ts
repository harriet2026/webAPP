import { resolve, type Capabilities, type FeatureDef, type Viewer } from '@/lib/product-form/resolve';
import type { Permission } from '@/contexts/auth-context';

const AGENT_CENTER_FEATURE_IDS = ['phishing-detection', 'spoofing-detection', 'threat-retro'];

// In every multi-tenant product form, the tenant viewer does not see the
// monitoring center. Every child route shares this prefix; once all children
// are filtered, sidebar-nav hides the empty parent group.
const MONITORING_HREF_PREFIX = '/monitoring/';

// In the multi-tenant tenant view, the renamed "Organization & members"
// system group retains only account/permission management and organization
// contacts. Platform view remains unchanged.
const ORG_MEMBERS_GROUP_HREFS = new Set<string>([
  '/mail-routing',
  '/tenants',
  '/system/proxysvr',
  '/system/dkim',
  '/system/platform-security',
  '/system/password-policy',
  '/smtp-credentials',
  '/users',
  '/organization-contacts',
]);
const ORG_MEMBERS_TENANT_VISIBLE_HREFS = new Set<string>([
  '/users',
  '/organization-contacts',
]);

/** Pure filter: returns the registry feature ids that are visible for the given form/viewer/grants. */
export function visibleNavIds(registry: FeatureDef[], caps: Capabilities, viewer: Viewer, grants: string[]): string[] {
  return registry.filter((f) => resolve(f, caps, viewer, grants).visible).map((f) => f.id);
}

/**
 * Form-visibility gate for a single nav item.
 *
 * Association between nav items and registry features is by **href** (the
 * canonical route), NOT by nav `id`: the registry feature `id` follows the
 * demo product-profile naming (e.g. `tenant-management`) while the nav `id`
 * is the webapp-internal page identity (e.g. `tenants`); the two only ever
 * meet at the shared route. Items without an href (parent groups) or with no
 * registry counterpart are additive (default-visible), per the spec's
 * "未登记=放行"灰度策略.
 */
export function isItemVisibleByForm(
  item: { id: string; href?: string },
  registry: FeatureDef[],
  visibleIds: Set<string>,
): boolean {
  if (!item.href) return true;
  if (item.href === '/agent-center/overview') {
    return AGENT_CENTER_FEATURE_IDS.some((id) => visibleIds.has(id));
  }
  const feat = registry.find((f) => !!f.href && f.href === item.href);
  if (!feat) return true;
  return visibleIds.has(feat.id);
}

/**
 * RBAC gate for a single nav item (Plan C Task 6, spec §7.2).
 *
 * Association between nav items and the RBAC submodule matrix happens
 * entirely inside `canSeeRoute` (Task 5), which is keyed by **href** via
 * `submoduleForHref` (Task 3): a route with no registered RBAC submodule is
 * additive (default-visible, "未登记=放行"), and a route gated by
 * `requiresAdvancedRules` is never registered in the matrix at all (spec
 * §7.5 hard exclusion), so it also passes this gate unconditionally — the
 * separate `requiresAdvancedRules` check in sidebar-nav.tsx's `isItemAllowed`
 * is what actually keeps it hidden, and the two gates are ANDed together.
 * A true super admin's `canSeeRoute` is unconditionally `true`.
 *
 * Items without an href (parent groups) are additive here too: their own
 * visibility is decided by whether any child remains visible after
 * filtering (handled in sidebar-nav.tsx's empty-children hide).
 */
export function isItemVisibleByRole(
  item: { id: string; href?: string },
  canSeeRoute: (href: string) => boolean,
): boolean {
  if (!item.href) return true;
  return canSeeRoute(item.href);
}

/** Minimal nav-item shape the gate needs (subset of NavItem to avoid a cyclic import). */
export interface GatedNavItem {
  id: string;
  href?: string;
  permission?: Permission;
  requiresAdvancedRules?: boolean;
}

/**
 * A parent group's own visibility contract.
 *
 * A group (an item with children) is visible iff at least one of its direct
 * children passes the full nav gate. This used to live only as an implicit
 * side-effect in sidebar-nav.tsx (`filteredChildren.length === 0 → return
 * null`); extracting it makes the contract explicit and unit-testable, so it
 * can no longer silently regress.
 *
 * This is precisely the mechanism that hides the「安全策略」(security) group
 * from the platform admin under every multi-tenant form: both of its children
 * (strategy-pipeline / group-policy) are `platformHidden`, so in the
 * multi-tenant platform view every child is filtered out and the group
 * collapses. The moment a NON-platformHidden child is added to that group,
 * this function will (correctly, and visibly in tests) start showing the group
 * to the platform admin — turning a hidden regression into a caught one.
 *
 * A leaf item (no children) is never hidden by THIS rule — its visibility is
 * decided solely by `isNavItemAllowed`.
 */
export function isGroupVisible(
  item: { children?: GatedNavItem[] },
  isAllowed: (child: GatedNavItem) => boolean,
): boolean {
  if (!item.children || item.children.length === 0) return true;
  return item.children.some(isAllowed);
}

/** The gate inputs a caller assembles once from useAuth() + useProductForm(). */
export interface NavGateContext {
  hasPermission: (permission: Permission) => boolean;
  isSystemAdmin: boolean;
  showAdvancedRules: boolean;
  canSeeRoute: (href: string) => boolean;
  registry: FeatureDef[];
  formVisible: Set<string> | null;
  capabilities?: Capabilities | null;
  viewer?: Viewer;
}

/**
 * The single source of truth for "is this nav item visible to the current
 * viewer" — the AND of permission + advance-gate + product-form + RBAC. Extracted
 * (GT-12376) so the admin-audit「操作模块」filter can reuse the EXACT same gate
 * the sidebar menu uses, instead of a second hand-written copy that would drift
 * (the recurring authorization-drift bug class). sidebar-nav.tsx's isItemAllowed
 * now delegates here.
 */
export function isNavItemAllowed(item: GatedNavItem, ctx: NavGateContext): boolean {
  if (item.permission && !ctx.hasPermission(item.permission)) return false;
  if (item.requiresAdvancedRules && !(ctx.isSystemAdmin && ctx.showAdvancedRules)) return false;
  if (ctx.formVisible && !isItemVisibleByForm(item, ctx.registry, ctx.formVisible)) return false;
  if (!isItemVisibleByRole(item, ctx.canSeeRoute)) return false;
  if (
    ctx.capabilities?.multiTenant &&
    ctx.viewer === 'tenant' &&
    item.href?.startsWith(MONITORING_HREF_PREFIX)
  ) {
    return false;
  }
  if (
    ctx.capabilities?.multiTenant &&
    ctx.viewer === 'tenant' &&
    item.href &&
    ORG_MEMBERS_GROUP_HREFS.has(item.href) &&
    !ORG_MEMBERS_TENANT_VISIBLE_HREFS.has(item.href)
  ) {
    return false;
  }
  return true;
}
