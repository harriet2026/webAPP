/**
 * RBAC submodule ↔ route/feature mapping artifact (spec §7.4 / §7.5).
 *
 * Single source of truth for:
 *  - The canonical RBAC permission-matrix module tree, migrated from the demo
 *    prototype (`design/origin/demo/components/admin/user-permission/types.ts`
 *    `PERM_MODULES`). Second-level submodule ids are the permission keys the
 *    matrix assigns view/edit/approve/delete against.
 *  - `SUBMODULE_ROUTE_MAP`: submodule id → webapp route (`href`) + product-form
 *    registry feature id (`featureId`), for Task 6 (menu visibility).
 *  - The §7.5 hard exclusion: any nav item gated by `requiresAdvancedRules`
 *    (see `@/lib/constants`) is NEVER part of the RBAC matrix, and no submodule
 *    route may point at one of those pages — including pages added later under
 *    those groups, since the exclusion set is derived from `sidebarNavItems`
 *    rather than hand-copied.
 *
 * Pure data/logic — no React, framework-agnostic, unit-testable in isolation.
 *
 * `labelKey` values are i18n keys reused from existing `sidebar.*` / `users.*`
 * copy wherever possible.
 *
 * INVARIANT (matrix ↔ real pages): every submodule in `PERM_MODULES` MUST map
 * to a webapp page — i.e. `SUBMODULE_ROUTE_MAP[id].href` is a non-empty string.
 * The matrix used to be a loose superset of the nav, carrying demo-only
 * concepts (举报中心/高管保护/灰邮治理/规则统计 …) that had no page anywhere, so a
 * role could be granted view/edit on a permission it could never exercise.
 * Those "dangling" submodules were removed; the assignable scope now equals
 * the set of features that actually exist in each viewer's product. This is
 * the same principle as the §7.5 advance-page exclusion below — permissions
 * for pages a viewer can't reach don't belong in the matrix. Note we align to
 * "real pages", NOT to live nav visibility: nav visibility is partly derived
 * from RBAC itself (circular) and partly from product-form capabilities, so
 * pages that exist but are currently hidden from the nav (链接与附件安全/邮件调查)
 * are also excluded here. The `rbac-modules.test.ts` invariant test enforces
 * this so a future edit can't reintroduce a pageless submodule.
 */

import { sidebarNavItems, type NavItem } from '@/lib/constants';

export type RbacScope = 'platform' | 'tenant';

export interface SubModuleMeta {
  /** Aligned with the second-level nav/permission id used across the demo and this codebase. */
  id: string;
  labelKey: string;
  supportApprove: boolean;
  supportDelete: boolean;
}

export interface ModuleMeta {
  key: string;
  labelKey: string;
  supportApprove: boolean;
  supportDelete: boolean;
  children: SubModuleMeta[];
}

const sub = (
  id: string,
  labelKey: string,
  supportApprove: boolean,
  supportDelete: boolean,
): SubModuleMeta => ({ id, labelKey, supportApprove, supportDelete });

// ==================== Module tree (migrated from demo PERM_MODULES) ====================

export const PERM_MODULES: ModuleMeta[] = [
  {
    // 系统状态是一个独立的顶层导航项(/dashboard)，两视角均可见 → 独立可授模块。
    // 之前它被错误地作为 monitor 模块的 monitor-dashboard 子项(标签「系统状态」
    // 却挂在监控中心下)，导致租户视角矩阵里能授监控中心、却看不到系统状态。
    key: 'systemStatus', labelKey: 'sidebar.systemStatus', supportApprove: false, supportDelete: false,
    children: [
      sub('system-status', 'sidebar.systemStatus', false, false),
    ],
  },
  {
    // 监控中心的全部子页均在 /monitoring/*，导航侧由 manage_tenants 门控 →
    // 平台专属(见 PLATFORM_ONLY_MODULE_KEYS)，租户视角矩阵不再出现监控中心。
    key: 'monitor', labelKey: 'sidebar.monitoringCenter', supportApprove: false, supportDelete: false,
    children: [
      // 监控总览(/monitoring/dashboard) 是监控中心的首个子页，此前遗漏。它与
      // 「系统状态」(/dashboard) 是两个不同的页面，不要混淆。
      sub('monitor-dashboard', 'sidebar.monitorDashboard', false, false),
      sub('monitor-infrastructure', 'sidebar.infrastructure', false, false),
      sub('monitor-mailflow', 'sidebar.mailflow', false, false),
      sub('monitor-security', 'rbac.module.monitorSecurity', false, false),
      sub('monitor-alerts', 'sidebar.alertCenter', false, false),
    ],
  },
  {
    key: 'statistics', labelKey: 'sidebar.statistics', supportApprove: false, supportDelete: false,
    children: [
      sub('security-overview', 'sidebar.securityOverview', false, false),
      sub('delivery-traffic-analysis', 'sidebar.deliveryTraffic', false, false),
      sub('ops-top-trend', 'sidebar.opsTopTrend', false, false),
    ],
  },
  {
    key: 'mailHandling', labelKey: 'sidebar.emailDisposal', supportApprove: true, supportDelete: true,
    children: [
      sub('disposal-center', 'sidebar.disposalCenter', true, true),
      sub('disposal-settings', 'sidebar.disposalSettings', true, true),
    ],
  },
  {
    key: 'security', labelKey: 'sidebar.security', supportApprove: false, supportDelete: false,
    children: [
      sub('strategy-pipeline', 'sidebar.policyPipeline', false, false),
      sub('group-policy', 'sidebar.groupManagement', false, false),
    ],
  },
  {
    key: 'agent', labelKey: 'sidebar.agentCenter', supportApprove: false, supportDelete: false,
    children: [
      sub('agent-management', 'sidebar.agentManagement', false, false),
    ],
  },
  {
    key: 'audit', labelKey: 'sidebar.logs', supportApprove: false, supportDelete: false,
    children: [
      sub('link-logs', 'sidebar.linkClicks', false, false),
      sub('auth-logs', 'sidebar.authAttempts', false, false),
      sub('admin-logs', 'sidebar.adminAuditLogs', false, false),
    ],
  },
  {
    key: 'system', labelKey: 'sidebar.system', supportApprove: false, supportDelete: false,
    children: [
      sub('tenant-management', 'sidebar.tenants', false, false),
      sub('platform-security-policy', 'sidebar.platformSecurityPolicy', false, false),
      sub('forwarding', 'sidebar.mailRouting', false, false),
      // 以下四页在平台导航「系统管理」组中真实存在(manage_tenants/manage_users 门)，
      // 此前矩阵遗漏、无法通过角色授权。均为平台专属(scope=platform / tenantAccess=hidden)，
      // 随 system 模块一起只在平台视角出现。
      sub('proxysvr', 'sidebar.proxysvr', false, false),
      sub('system-dkim', 'sidebar.dkimOverview', false, false),
      sub('password-policy', 'sidebar.passwordPolicy', false, false),
      sub('smtp-credentials', 'sidebar.smtpCredentials', false, false),
    ],
  },
  {
    // 组织与成员(/organization-contacts)对租户管理员本就可访问(页面无平台门)，
    // 之前被错误地并入平台专属的 system 模块，导致租户视角看不到。抽为独立模块，
    // 不进 PLATFORM_ONLY / TENANT_ONLY → 两视角均可授。
    key: 'organization', labelKey: 'rbac.module.organization', supportApprove: false, supportDelete: false,
    children: [
      sub('contacts', 'sidebar.organizationContacts', false, false),
    ],
  },
  {
    key: 'userPermission', labelKey: 'rbac.module.userPermission', supportApprove: false, supportDelete: false,
    children: [
      sub('admin-account', 'users.tabs.accounts', false, false),
      sub('role-permission', 'rbac.module.rolePermission', false, false),
      sub('login-security', 'users.tabs.loginSecurity', false, false),
    ],
  },
];

/** All second-level submodules, in PERM_MODULES order. */
export const ALL_SUB_MODULES: SubModuleMeta[] = PERM_MODULES.flatMap((m) => m.children);

/** All submodule ids under the given top-level module keys. */
export function subIdsOfModules(keys: string[]): string[] {
  return PERM_MODULES.filter((m) => keys.includes(m.key)).flatMap((m) => m.children.map((c) => c.id));
}

/** Look up a submodule's metadata by its second-level id. */
export function findSubModule(id: string): SubModuleMeta | undefined {
  return ALL_SUB_MODULES.find((s) => s.id === id);
}

// Platform-exclusive modules: only a platform admin may assign them; hidden from the tenant scope.
// - system: 系统管理(租户管理/平台安全策略/邮件路由)
// - monitor: 监控中心(/monitoring/* 全部由导航的 manage_tenants 门控，租户不可达)
// 注意「系统状态」(/dashboard) 与「组织与成员」(/organization-contacts) 是两视角共享，
// 不在此列表内。
export const PLATFORM_ONLY_MODULE_KEYS = ['system', 'monitor'];

// Tenant-exclusive business modules: assignable only to tenant admins; hidden from the platform scope
// (mirrors the product's platformHidden business capabilities — 安全策略/智能体中心).
// 高管保护(executive) used to live here but was removed with the rest of the
// pageless demo modules; keep this list in sync with actual tenant-only pages.
export const TENANT_ONLY_MODULE_KEYS = ['security', 'agent'];

/**
 * Modules assignable within the given scope:
 *  - platform: drop tenant-exclusive business modules
 *  - tenant:   drop the platform-exclusive module
 */
export function getScopedModules(scope: RbacScope): ModuleMeta[] {
  if (scope === 'tenant') return PERM_MODULES.filter((m) => !PLATFORM_ONLY_MODULE_KEYS.includes(m.key));
  return PERM_MODULES.filter((m) => !TENANT_ONLY_MODULE_KEYS.includes(m.key));
}

/** Flattened submodules assignable within the given scope — the matrix's row set for that scope. */
export function rbacSubmodulesForScope(scope: RbacScope): SubModuleMeta[] {
  return getScopedModules(scope).flatMap((m) => m.children);
}

/**
 * Product-form-aware view of the scoped module tree (spec §7.4 alignment).
 *
 * `getScopedModules` splits platform/tenant, but that is NOT enough to match
 * the nav: the sidebar also hides items whose product-form registry
 * `visibility` resolves to hidden for the current capabilities/viewer — e.g.
 * `forwarding` (SINGLE_ONLY) is absent from every multi-tenant nav, while
 * `platform-security-policy`/`tenant-management` (MULTI_ONLY) are absent from
 * single-tenant. A static matrix over-grants those form-specific pages.
 *
 * This keeps the module tree framework-agnostic: the caller supplies
 * `isSubmoduleVisible` (built in RoleDrawer from `useProductForm` +
 * `isItemVisibleByForm`, the SAME gate the sidebar uses, keyed by the
 * submodule's `SUBMODULE_ROUTE_MAP` href). Submodules the predicate rejects
 * are dropped, and any module left with no children collapses — mirroring
 * `isGroupVisible`'s empty-group contract in the sidebar.
 */
export function visibleModulesForScope(
  scope: RbacScope,
  isSubmoduleVisible: (subId: string) => boolean,
): ModuleMeta[] {
  return getScopedModules(scope)
    .map((m) => ({ ...m, children: m.children.filter((s) => isSubmoduleVisible(s.id)) }))
    .filter((m) => m.children.length > 0);
}

// ==================== §7.5 advance-page hard exclusion ====================
//
// Derived (not hand-copied) from sidebarNavItems: any node whose own
// `requiresAdvancedRules` is true, or that descends from such a node, is
// excluded. sidebar-nav.tsx only sets the flag on the group node itself and
// relies on short-circuiting the parent's render to hide the whole subtree
// (see SidebarNavItem: `if (!isItemAllowed(item)) return null` runs before
// children are ever filtered) — so the exclusion here must inherit down the
// tree the same way, or a future leaf added under 'advanced-rules'/'mail'
// without repeating the flag would slip through.

function collectAdvanceExcluded(items: NavItem[], inherited: boolean): { hrefs: string[]; ids: string[] } {
  const hrefs: string[] = [];
  const ids: string[] = [];
  for (const item of items) {
    const excluded = inherited || !!item.requiresAdvancedRules;
    if (excluded) {
      ids.push(item.id);
      if (item.href) hrefs.push(item.href);
    }
    if (item.children) {
      const child = collectAdvanceExcluded(item.children, excluded);
      hrefs.push(...child.hrefs);
      ids.push(...child.ids);
    }
  }
  return { hrefs, ids };
}

const advanceExcluded = collectAdvanceExcluded(sidebarNavItems, false);

/** Routes (hrefs) that live under a requiresAdvancedRules-gated nav group — never valid RBAC matrix targets. */
export const ADVANCE_EXCLUDED_ROUTES: string[] = advanceExcluded.hrefs;

/** Nav item ids (at any depth) that live under a requiresAdvancedRules-gated group, including the group itself. */
export const ADVANCE_EXCLUDED_NAV_IDS: string[] = advanceExcluded.ids;

/** Whether a webapp nav item id is hard-excluded from the RBAC matrix per spec §7.5. */
export function isAdvanceExcluded(navItemId: string): boolean {
  return ADVANCE_EXCLUDED_NAV_IDS.includes(navItemId);
}

// ==================== submodule id → route/feature mapping ====================

interface RouteEntry {
  /** webapp route this submodule's page lives at. Absent when the demo concept has no webapp page yet (additive/default-allow, see Task 6 sidebar-visibility.ts convention). */
  href?: string;
  /** product-form registry feature id gating this route's visibility (see src/lib/product-form + sidebar-visibility.ts), where one is known to exist. */
  featureId?: string;
}

/**
 * Build a route entry while enforcing the §7.5 hard filter: a submodule can
 * never resolve to a route that lives under an advance-gated nav group, even
 * if a future edit here tries to point one at it.
 */
function route(href?: string, featureId?: string): RouteEntry {
  if (href && ADVANCE_EXCLUDED_ROUTES.includes(href)) {
    throw new Error(`rbac-modules: route "${href}" is advance-excluded (spec §7.5) and cannot be assigned to an RBAC submodule`);
  }
  return { href, featureId };
}

export const SUBMODULE_ROUTE_MAP: Record<string, RouteEntry> = {
  // ---- systemStatus (both scopes) ----
  'system-status': route('/dashboard', 'system-status'),

  // ---- monitor (platform-only) ----
  // 监控总览未登记于 product-form registry → featureId 省略(未登记=放行)。
  'monitor-dashboard': route('/monitoring/dashboard'),
  'monitor-infrastructure': route('/monitoring/infrastructure', 'monitor-infrastructure'),
  'monitor-mailflow': route('/monitoring/mailflow'),
  'monitor-security': route('/monitoring/security'),
  'monitor-alerts': route('/monitoring/alerts'),

  // ---- statistics ----
  'security-overview': route('/statistics/security-overview', 'security-overview'),
  'delivery-traffic-analysis': route('/statistics/delivery-traffic', 'delivery-traffic-analysis'),
  'ops-top-trend': route('/statistics/ops-top-trend', 'ops-top-trend'),

  // ---- mailHandling ----
  'disposal-center': route('/email-disposal/center', 'disposal-center'),
  'disposal-settings': route('/email-disposal/disposal-settings', 'disposal-settings'),

  // ---- security (tenant-only) ----
  'strategy-pipeline': route('/security/pipeline', 'strategy-pipeline'),
  'group-policy': route('/security/groups', 'group-policy'),

  // ---- agent (tenant-only) ----
  // demo models a single "智能体管理" submodule; the webapp/product-form
  // registry instead exposes 3 per-agent features (phishing-detection,
  // spoofing-detection, threat-retro) at /agent-center/overview?agent=...
  // under the same page. We map to the shared page href and leave featureId
  // unset (no single feature id represents the whole submodule).
  'agent-management': route('/agent-center/overview'),

  // ---- audit ----
  'link-logs': route('/logs/link-clicks', 'link-clicks'),
  'auth-logs': route('/logs/auth-attempts', 'auth-logs'),
  'admin-logs': route('/logs/admin-audit', 'admin-logs'),

  // ---- system (platform-only) ----
  'tenant-management': route('/tenants', 'tenant-management'),
  'platform-security-policy': route('/system/platform-security', 'platform-security-policy'),
  forwarding: route('/mail-routing', 'forwarding'),
  proxysvr: route('/system/proxysvr', 'proxysvr'),
  'system-dkim': route('/system/dkim', 'system-dkim'),
  'password-policy': route('/system/password-policy', 'password-policy'),
  'smtp-credentials': route('/smtp-credentials', 'smtp-credentials'),

  // ---- organization (both scopes) ----
  contacts: route('/organization-contacts', 'contacts'),

  // ---- userPermission ----
  // all three submodules manage tabs of the single /users page.
  'admin-account': route('/users', 'user-management'),
  'role-permission': route('/users', 'user-management'),
  'login-security': route('/users', 'user-management'),
};

/**
 * Reverse lookup: webapp route → submodule id, for sidebar menu-visibility use
 * (Task 6). When multiple submodules share a route (e.g. /users), the first
 * match in PERM_MODULES order is returned — sidebar gating only needs "is
 * *a* submodule for this route visible", not a specific one.
 */
export function submoduleForHref(href: string): string | undefined {
  for (const s of ALL_SUB_MODULES) {
    if (SUBMODULE_ROUTE_MAP[s.id]?.href === href) return s.id;
  }
  return undefined;
}
