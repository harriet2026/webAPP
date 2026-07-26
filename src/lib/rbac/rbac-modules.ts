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
 * `labelKey` values are i18n keys. Where an existing `sidebar.*` / `users.*`
 * key already carries the right zh/en copy, it's reused directly. Submodules
 * with no existing sidebar counterpart (mostly demo-only concepts not yet
 * surfaced in the webapp nav, e.g. 举报中心/高管保护/灰邮治理) use a new
 * `rbac.module.*` key placeholder — those keys are added to
 * messages/{zh,en}.json in Task 8, not here.
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
    key: 'monitor', labelKey: 'sidebar.monitoringCenter', supportApprove: false, supportDelete: false,
    children: [
      sub('monitor-dashboard', 'sidebar.systemStatus', false, false),
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
      sub('link-attachment-security', 'sidebar.linkAttachmentSecurity', false, false),
      sub('ops-top-trend', 'sidebar.opsTopTrend', false, false),
      sub('rule-stats-v2', 'rbac.module.ruleStatsV2', false, false),
    ],
  },
  {
    key: 'mailHandling', labelKey: 'sidebar.emailDisposal', supportApprove: true, supportDelete: true,
    children: [
      sub('disposal-center', 'sidebar.disposalCenter', true, true),
      sub('disposal-settings', 'sidebar.disposalSettings', true, true),
      sub('grey-mail-policy', 'rbac.module.greyMailPolicy', true, true),
      sub('grey-mail-queue', 'rbac.module.greyMailQueue', true, true),
    ],
  },
  {
    key: 'report', labelKey: 'rbac.module.report', supportApprove: true, supportDelete: false,
    children: [
      sub('report-management', 'rbac.module.reportManagement', true, false),
      sub('report-strategy', 'rbac.module.reportStrategy', true, false),
    ],
  },
  {
    key: 'security', labelKey: 'sidebar.security', supportApprove: false, supportDelete: false,
    children: [
      sub('strategy-pipeline', 'sidebar.policyPipeline', false, false),
      sub('group-policy', 'sidebar.groupManagement', false, false),
      sub('policy-test', 'rbac.module.policyTest', false, false),
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
      sub('mail-investigation', 'sidebar.mailInvestigation', false, false),
      sub('ai-url-logs', 'rbac.module.aiUrlLogs', false, false),
      sub('link-logs', 'sidebar.linkClicks', false, false),
      sub('auth-logs', 'sidebar.authAttempts', false, false),
      sub('system-logs', 'rbac.module.systemLogs', false, false),
      sub('admin-logs', 'sidebar.adminAuditLogs', false, false),
    ],
  },
  {
    key: 'executive', labelKey: 'rbac.module.executive', supportApprove: false, supportDelete: false,
    children: [
      sub('executive-dashboard', 'rbac.module.executiveDashboard', false, false),
      sub('executive-policy', 'rbac.module.executivePolicy', false, false),
      sub('executive-monitoring', 'rbac.module.executiveMonitoring', false, false),
    ],
  },
  {
    key: 'system', labelKey: 'sidebar.system', supportApprove: false, supportDelete: false,
    children: [
      sub('tenant-management', 'sidebar.tenants', false, false),
      sub('platform-security-policy', 'sidebar.platformSecurityPolicy', false, false),
      sub('network', 'rbac.module.network', false, false),
      sub('forwarding', 'sidebar.mailRouting', false, false),
      sub('contacts', 'sidebar.organizationContacts', false, false),
      sub('data-management', 'rbac.module.dataManagement', false, false),
      sub('authorization-upgrade', 'rbac.module.authorizationUpgrade', false, false),
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

// Platform-exclusive module: only a platform admin may assign it; hidden from the tenant scope.
export const PLATFORM_ONLY_MODULE_KEYS = ['system'];

// Tenant-exclusive business modules: assignable only to tenant admins; hidden from the platform scope
// (mirrors the product's platformHidden business capabilities — 安全策略/智能体中心/高管保护).
export const TENANT_ONLY_MODULE_KEYS = ['security', 'agent', 'executive'];

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
  // ---- monitor ----
  'monitor-dashboard': route('/dashboard', 'system-status'),
  'monitor-infrastructure': route('/monitoring/infrastructure', 'monitor-infrastructure'),
  'monitor-mailflow': route('/monitoring/mailflow'),
  'monitor-security': route('/monitoring/security'),
  'monitor-alerts': route('/monitoring/alerts'),

  // ---- statistics ----
  'security-overview': route('/statistics/security-overview', 'security-overview'),
  'delivery-traffic-analysis': route('/statistics/delivery-traffic', 'delivery-traffic-analysis'),
  'link-attachment-security': route('/statistics/link-attachment-security', 'link-attachment-security'),
  'ops-top-trend': route('/statistics/ops-top-trend', 'ops-top-trend'),
  'rule-stats-v2': route(), // 规则统计: no dedicated webapp page yet

  // ---- mailHandling ----
  'disposal-center': route('/email-disposal/center', 'disposal-center'),
  'disposal-settings': route('/email-disposal/disposal-settings', 'disposal-settings'),
  'grey-mail-policy': route(), // 灰邮治理-策略配置: not yet built in webapp
  'grey-mail-queue': route(), // 灰邮治理-灰邮队列: not yet built in webapp

  // ---- report ----
  'report-management': route(), // 举报管理: not yet built in webapp
  'report-strategy': route(), // 举报策略设置: not yet built in webapp

  // ---- security (tenant-only) ----
  'strategy-pipeline': route('/security/pipeline', 'strategy-pipeline'),
  'group-policy': route('/security/groups', 'group-policy'),
  'policy-test': route(), // 策略测试: not yet built in webapp

  // ---- agent (tenant-only) ----
  // demo models a single "智能体管理" submodule; the webapp/product-form
  // registry instead exposes 3 per-agent features (phishing-detection,
  // spoofing-detection, threat-retro) at /agent-center/overview?agent=...
  // under the same page. We map to the shared page href and leave featureId
  // unset (no single feature id represents the whole submodule).
  'agent-management': route('/agent-center/overview'),

  // ---- audit ----
  'mail-investigation': route('/logs/mail-investigation'),
  'ai-url-logs': route(undefined, 'ai-url-logs'), // 沙箱日志: registry feature exists but has no route yet
  'link-logs': route('/logs/link-clicks', 'link-clicks'),
  'auth-logs': route('/logs/auth-attempts', 'auth-logs'),
  'system-logs': route(), // 通知日志: not yet built in webapp
  'admin-logs': route('/logs/admin-audit', 'admin-logs'),

  // ---- executive (tenant-only) ----
  'executive-dashboard': route(), // not yet built in webapp
  'executive-policy': route(),
  'executive-monitoring': route(),

  // ---- system (platform-only) ----
  'tenant-management': route('/tenants', 'tenant-management'),
  'platform-security-policy': route('/system/platform-security', 'platform-security-policy'),
  network: route(), // 网络设置: not yet built in webapp
  forwarding: route('/mail-routing', 'forwarding'),
  contacts: route('/organization-contacts', 'contacts'),
  'data-management': route(), // 数据管理: not yet built in webapp
  'authorization-upgrade': route(), // 升级更新: not yet built in webapp

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
