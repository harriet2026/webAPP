import { resolve, type Capabilities, type FeatureDef, type Viewer } from '@/lib/product-form/resolve';
import type { Permission } from '@/contexts/auth-context';

const AGENT_CENTER_FEATURE_IDS = ['phishing-detection', 'spoofing-detection', 'threat-retro'];

// 多租户形态（云网关 / AI版·多租户 / 传统版·多租户，均 multiTenant=true）下，
// 「租户管理员视角」对整个监控中心模块不可见（平台管理员可见）。监控中心
// 所有子路由均以 `/monitoring/` 为前缀，按此前缀关联；父分组自身无 href，
// 其全部子项被裁剪后由 sidebar-nav 的「空子项隐藏」逻辑自动折叠。
const MONITORING_HREF_PREFIX = '/monitoring/';

// 多租户形态 + 「租户管理员视角」下，「组织与成员」分组（即多租户租户视角下
// 改名后的 `system` 组）仅保留「管理员与权限」`/users` 与「组织通讯录」
// `/organization-contacts` 两项，其余组内项（邮件路由 / 租户管理 / 代理服务器
// 管理 / DKIM 总览 / 平台安全策略 / 密码策略 / SMTP 凭证）不可见。按 href 关联，
// 与既有裁剪风格一致；平台管理员视角完全不受影响。
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
  '/users', // 管理员与权限
  '/organization-contacts', // 组织通讯录
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

/** The gate inputs a caller assembles once from useAuth() + useProductForm(). */
export interface NavGateContext {
  hasPermission: (permission: Permission) => boolean;
  isSystemAdmin: boolean;
  showAdvancedRules: boolean;
  canSeeRoute: (href: string) => boolean;
  registry: FeatureDef[];
  formVisible: Set<string> | null;
  // 当前生效的产品形态能力与登录视角，用于「多租户 + 租户视角」的监控中心裁剪。
  // 可选：未提供时该裁剪规则不生效（保持既有行为，避免破坏隔离测试）。
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
  // 多租户形态 + 租户视角：整个监控中心模块不可见（平台管理员可见）。
  if (
    ctx.capabilities?.multiTenant &&
    ctx.viewer === 'tenant' &&
    item.href &&
    item.href.startsWith(MONITORING_HREF_PREFIX)
  ) {
    return false;
  }
  // 多租户形态 + 租户视角：「组织与成员」分组仅保留「管理员与权限」「组织通讯录」，
  // 组内其余项不可见（平台管理员可见）。
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
