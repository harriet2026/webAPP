import { sidebarNavItems, type NavItem } from '@/lib/constants';

export interface OpTypeMeta {
  labelKey: string;
  badge: string;
}

const BLUE_BADGE = 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
const AMBER_BADGE = 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
const RED_BADGE = 'bg-red-50 text-red-700 ring-1 ring-red-200';
const GREEN_BADGE = 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
const GRAY_BADGE = 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';

export const OP_TYPE_META: Record<string, OpTypeMeta> = {
  create: { labelKey: 'adminAudit.opType.create', badge: BLUE_BADGE },
  import: { labelKey: 'adminAudit.opType.import', badge: BLUE_BADGE },
  export: { labelKey: 'adminAudit.opType.export', badge: BLUE_BADGE },
  ai_interpret: { labelKey: 'adminAudit.opType.aiInterpret', badge: BLUE_BADGE },

  update: { labelKey: 'adminAudit.opType.update', badge: AMBER_BADGE },
  reset_password: { labelKey: 'adminAudit.opType.resetPassword', badge: AMBER_BADGE },

  delete: { labelKey: 'adminAudit.opType.delete', badge: RED_BADGE },
  delete_item: { labelKey: 'adminAudit.opType.deleteItem', badge: RED_BADGE },
  reject: { labelKey: 'adminAudit.opType.reject', badge: RED_BADGE },
  block: { labelKey: 'adminAudit.opType.block', badge: RED_BADGE },

  approve: { labelKey: 'adminAudit.opType.approve', badge: GREEN_BADGE },
  release: { labelKey: 'adminAudit.opType.release', badge: GREEN_BADGE },
  exempt: { labelKey: 'adminAudit.opType.exempt', badge: GREEN_BADGE },
  unlock: { labelKey: 'adminAudit.opType.unlock', badge: GREEN_BADGE },
  reinject: { labelKey: 'adminAudit.opType.reinject', badge: GREEN_BADGE },

  bulk_action: { labelKey: 'adminAudit.opType.bulkAction', badge: GRAY_BADGE },
};

const FALLBACK_META: OpTypeMeta = {
  labelKey: 'adminAudit.opType.unknown',
  badge: GRAY_BADGE,
};

export function opTypeMeta(action: string): OpTypeMeta {
  return OP_TYPE_META[action] ?? FALLBACK_META;
}

type ModuleRef = { topKey: string; subKey: string };

const OTHER_MODULE: ModuleRef = {
  topKey: 'adminAudit.moduleOther',
  subKey: 'adminAudit.moduleOther',
};

// RESOURCE_TO_SIDEBAR maps a backend resource_type (the actual values written
// by audit_middleware.go extractOperationDetails and models.AdminResourceType)
// to the sidebar i18n key used to label it in the audit UI. The values MUST
// stay in sync with the backend constants — drift means real audit rows fall
// into "其他" (Other) and the module filter sends a resource_type the backend
// doesn't recognize (review finding #2).
const RESOURCE_TO_SIDEBAR: Record<string, ModuleRef> = {
  // --- Backend models.AdminResourceType constants (internal/models/admin.go) ---
  rules: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.rulePipelineOverview' },
  users: { topKey: 'sidebar.system', subKey: 'sidebar.users' },
  tenants: { topKey: 'sidebar.system', subKey: 'sidebar.tenants' },
  quarantine: { topKey: 'sidebar.mail', subKey: 'sidebar.quarantine' },
  sideline: { topKey: 'sidebar.mail', subKey: 'sidebar.sideline' },
  smtp_credentials: { topKey: 'sidebar.system', subKey: 'sidebar.smtpCredentials' },
  config_overrides: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.configManagement' },
  outbound_audit: { topKey: 'sidebar.mail', subKey: 'sidebar.auditQueue' },
  mail_logs: { topKey: 'sidebar.mail', subKey: 'sidebar.emailLogs' },
  attachment_security: { topKey: 'sidebar.statistics', subKey: 'sidebar.linkAttachmentSecurity' },
  url_protection: { topKey: 'sidebar.statistics', subKey: 'sidebar.linkAttachmentSecurity' },
  security_config: { topKey: 'sidebar.statistics', subKey: 'sidebar.securityOverview' },
  phishing_agent: { topKey: 'sidebar.agentCenter', subKey: 'sidebar.phishingDetection' },
  spoofing_agent: { topKey: 'sidebar.agentCenter', subKey: 'sidebar.spoofingDetection' },

  // --- audit_middleware.go additional resource types (kebab-case) ---
  'mail-auth-configs': { topKey: 'sidebar.system', subKey: 'sidebar.mailRouting' },
  'contact-sources': { topKey: 'sidebar.system', subKey: 'sidebar.organizationContacts' },
  'contact-sync-logs': { topKey: 'sidebar.system', subKey: 'sidebar.organizationContacts' },
  contacts: { topKey: 'sidebar.system', subKey: 'sidebar.organizationContacts' },
  'link-protection-blacklist': { topKey: 'sidebar.statistics', subKey: 'sidebar.linkAttachmentSecurity' },

  // --- Other audit resource types produced across the codebase ---
  organization_contacts: { topKey: 'sidebar.system', subKey: 'sidebar.organizationContacts' },
  mail_routing: { topKey: 'sidebar.system', subKey: 'sidebar.mailRouting' },
  proxysvr: { topKey: 'sidebar.system', subKey: 'sidebar.proxysvr' },
  dkim: { topKey: 'sidebar.system', subKey: 'sidebar.dkimOverview' },
  dkim_keys: { topKey: 'sidebar.system', subKey: 'sidebar.dkimOverview' },
  bounce_dsn: { topKey: 'sidebar.mail', subKey: 'sidebar.bounceDsnSettings' },
  inbound_audit: { topKey: 'sidebar.mail', subKey: 'sidebar.inboundAudit' },
  audit_queue: { topKey: 'sidebar.mail', subKey: 'sidebar.auditQueue' },
  admin_audit: { topKey: 'sidebar.mail', subKey: 'sidebar.adminAuditLogs' },

  // IP / sender rules and detection profiles
  ip_rules: { topKey: 'sidebar.security', subKey: 'sidebar.ipFrequency' },
  ip_rule: { topKey: 'sidebar.security', subKey: 'sidebar.ipFrequency' },
  sender_rules: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.rulePipelineOverview' },
  sender_rule: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.rulePipelineOverview' },
  behavior_groups: { topKey: 'sidebar.security', subKey: 'sidebar.groupManagement' },
  behavior_group: { topKey: 'sidebar.security', subKey: 'sidebar.groupManagement' },
  policy_pipeline: { topKey: 'sidebar.security', subKey: 'sidebar.policyPipeline' },
  route_rules: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.routeRules' },
  config_management: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.configManagement' },

  rbl: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.rbl' },
  exec_impersonation: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.execImpersonation' },
  domain_lookalike: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.domainLookalike' },
  similar_detection: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.similarDetection' },
  password_book: { topKey: 'sidebar.advancedRules', subKey: 'sidebar.passwordBook' },

  threat_retro: { topKey: 'sidebar.agentCenter', subKey: 'sidebar.threatRetro' },

  disposal_center: { topKey: 'sidebar.emailDisposal', subKey: 'sidebar.disposalCenter' },
  disposal_settings: { topKey: 'sidebar.emailDisposal', subKey: 'sidebar.disposalSettings' },

  auth_attempts: { topKey: 'sidebar.logs', subKey: 'sidebar.authAttempts' },
  link_clicks: { topKey: 'sidebar.logs', subKey: 'sidebar.linkClicks' },

  delivery_traffic: { topKey: 'sidebar.statistics', subKey: 'sidebar.deliveryTraffic' },
  ops_top_trend: { topKey: 'sidebar.statistics', subKey: 'sidebar.opsTopTrend' },
  link_attachment_security: { topKey: 'sidebar.statistics', subKey: 'sidebar.linkAttachmentSecurity' },
  statistics: { topKey: 'sidebar.statistics', subKey: 'sidebar.securityOverview' },
};

// AUDITABLE_RESOURCE_TYPES is the set of resource_type values the backend
// actually WRITES to admin_operation_audit_logs (audit_middleware.go
// extractOperationDetails switch + fallback + manual auditDKIM). Only these are
// offered as "operation module" filter options — the rest of RESOURCE_TO_SIDEBAR
// exists purely to LABEL a row's module (moduleOf); as filter options they would
// either duplicate a label or never match any row (review: dead / under-filtering
// module options).
const AUDITABLE_RESOURCE_TYPES: string[] = [
  'rules',
  'users',
  'tenants',
  'quarantine',
  'sideline',
  'smtp_credentials',
  'config_overrides',
  'outbound_audit',
  'mail_logs',
  'attachment_security',
  'url_protection',
  'security_config',
  'phishing_agent',
  'spoofing_agent',
  'statistics',
  'mail-auth-configs',
  'contact-sources',
  'contact-sync-logs',
  'contacts',
  'link-protection-blacklist',
  'dkim_keys',
];

export function moduleOf(resourceType: string): ModuleRef {
  if (!resourceType) return OTHER_MODULE;
  const direct = RESOURCE_TO_SIDEBAR[resourceType];
  if (direct) return direct;
  const singular = resourceType.endsWith('s') ? resourceType.slice(0, -1) : resourceType;
  const bySingular = RESOURCE_TO_SIDEBAR[singular];
  if (bySingular) return bySingular;
  const plural = `${resourceType}s`;
  const byPlural = RESOURCE_TO_SIDEBAR[plural];
  if (byPlural) return byPlural;
  return OTHER_MODULE;
}

export interface ModuleGroupItem {
  value: string;
  subKey: string;
}

export interface ModuleGroup {
  topKey: string;
  items: ModuleGroupItem[];
}

const GROUP_ORDER: string[] = [
  'sidebar.system',
  'sidebar.security',
  'sidebar.advancedRules',
  'sidebar.agentCenter',
  'sidebar.emailDisposal',
  'sidebar.mail',
  'sidebar.logs',
  'sidebar.statistics',
];

function buildModuleGroups(): ModuleGroup[] {
  // Group auditable resource_types by their (topKey, subKey) module so each
  // distinct module renders as exactly ONE option, whose value is the
  // comma-joined set of resource_types it covers. The backend resource_type
  // filter accepts that CSV and matches ANY of them — so selecting e.g.
  // 「链接与附件安全」 filters attachment_security + url_protection +
  // link-protection-blacklist together instead of just one (fixes duplicate
  // labels and under-filtering).
  const byModule = new Map<string, { topKey: string; subKey: string; values: string[] }>();
  for (const rt of AUDITABLE_RESOURCE_TYPES) {
    const ref = RESOURCE_TO_SIDEBAR[rt];
    if (!ref || ref.topKey === 'adminAudit.moduleOther') continue;
    const key = `${ref.topKey}||${ref.subKey}`;
    const entry = byModule.get(key);
    if (entry) {
      entry.values.push(rt);
    } else {
      byModule.set(key, { topKey: ref.topKey, subKey: ref.subKey, values: [rt] });
    }
  }

  const buckets = new Map<string, ModuleGroupItem[]>();
  for (const { topKey, subKey, values } of byModule.values()) {
    if (!buckets.has(topKey)) buckets.set(topKey, []);
    buckets.get(topKey)!.push({ value: [...values].sort().join(','), subKey });
  }

  const groups: ModuleGroup[] = [];
  for (const topKey of GROUP_ORDER) {
    const items = buckets.get(topKey);
    if (items && items.length > 0) {
      items.sort((a, b) => a.subKey.localeCompare(b.subKey));
      groups.push({ topKey, items });
    }
  }
  return groups;
}

export const AUDIT_MODULE_GROUPS: ModuleGroup[] = buildModuleGroups();

// --- GT-12376: gate the「操作模块」filter options by the sidebar menu visibility ---
//
// The static AUDIT_MODULE_GROUPS above lists EVERY auditable module regardless of
// the current role / product-form / agent-lock state, so a platform admin saw
// tenant-only modules (组织通讯录) and locked agents (钓鱼/仿冒智能体) as filter
// options that can never match a visible row. The fix reuses the sidebar's exact
// visibility gate: an audit module's subKey equals the sidebar nav item's
// titleKey, so we look the module up in the nav tree and run it through the same
// isNavItemAllowed the menu uses. Agent-center sub-modules have no standalone nav
// item — gate them by their product-form feature grant instead (locked = hidden).

// subKey (== nav titleKey) -> the sidebar nav item, walked once from the nav tree.
const NAV_ITEM_BY_TITLE_KEY: Map<string, NavItem> = (() => {
  const map = new Map<string, NavItem>();
  const walk = (items: NavItem[]) => {
    for (const it of items) {
      if (!map.has(it.titleKey)) map.set(it.titleKey, it);
      if (it.children) walk(it.children);
    }
  };
  walk(sidebarNavItems);
  return map;
})();

// Agent-center audit sub-modules -> product-form feature id (matches
// AGENT_CENTER_FEATURE_IDS in sidebar-visibility.ts). A locked/ungranted agent
// has its feature id absent from the visible set, so it drops from the filter.
const AGENT_SUBKEY_FEATURE: Record<string, string> = {
  'sidebar.phishingDetection': 'phishing-detection',
  'sidebar.spoofingDetection': 'spoofing-detection',
  'sidebar.threatRetro': 'threat-retro',
};

/**
 * Filter AUDIT_MODULE_GROUPS down to the modules the current viewer can actually
 * see, reusing the sidebar gates. `isNavItemVisible` is the shared
 * isNavItemAllowed bound to the current gate context; `isFeatureVisible` reports
 * whether a product-form feature id is granted/visible. A module whose subKey has
 * neither a nav item nor a feature mapping is additive (kept — "未登记=放行").
 */
export function filterVisibleModuleGroups(
  groups: ModuleGroup[],
  isNavItemVisible: (item: NavItem) => boolean,
  isFeatureVisible: (featureId: string) => boolean,
): ModuleGroup[] {
  const keep = (subKey: string): boolean => {
    const feat = AGENT_SUBKEY_FEATURE[subKey];
    if (feat) return isFeatureVisible(feat);
    const nav = NAV_ITEM_BY_TITLE_KEY.get(subKey);
    if (nav) return isNavItemVisible(nav);
    return true;
  };
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => keep(it.subKey)) }))
    .filter((g) => g.items.length > 0);
}
