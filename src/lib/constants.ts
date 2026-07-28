import type { LucideIcon } from 'lucide-react';
import {
  Shield,
  Settings,
  Tags,
  MailOpen,
  Globe,
  UserCheck,
  Search,
  Bot,
  MailCheck,
  WandSparkles,
  Hash,
  SlidersHorizontal,
  KeyRound,
  Workflow,
  Route,
  ShieldAlert,
  Activity,
  Contact,
  // GT: 侧边栏一级分组图标与 demo 原型（component-sidebar-nav html_spec）对齐
  Gauge,
  PieChart,
  LogOut,
  AlertCircle,
  Filter,
} from 'lucide-react';

export interface NavItem {
  id: string;
  titleKey: string;
  href?: string;
  icon?: LucideIcon;
  children?: NavItem[];
  permission?: 'manage_tenants' | 'manage_users' | 'view_auth_attempts' | 'view_admin_audit_logs' | 'view_link_logs' | 'manage_ip_frequency' | 'manage_login_security';
  requiresAdvancedRules?: boolean;
}

// 一级分组顺序对齐 demo 原型（component-sidebar-nav html_spec）：
// 系统状态 → 监控中心 → 统计报表 → 邮件处置 → 安全策略 → 智能体中心 → 日志审计 → 系统管理。
// webapp 独有的两组（邮件管理 mail / 高级规则设置 advanced-rules，demo 无对应）就近插入
// 其功能同类之后（mail 紧随邮件处置；advanced-rules 紧随安全策略）。demo 独有的
// 举报中心 / 高管保护在 webapp 无对应页面，按需求不新增。
export const sidebarNavItems: NavItem[] = [
  {
    id: 'dashboard',
    titleKey: 'sidebar.systemStatus',
    href: '/dashboard',
    icon: Activity,
  },
  {
    id: 'monitoring-center',
    titleKey: 'sidebar.monitoringCenter',
    icon: Gauge,
    children: [
      { id: 'monitor-dashboard', titleKey: 'sidebar.monitorDashboard', href: '/monitoring/dashboard', permission: 'manage_tenants' },
      { id: 'infrastructure', titleKey: 'sidebar.infrastructure', href: '/monitoring/infrastructure', permission: 'manage_tenants' },
      { id: 'mailflow', titleKey: 'sidebar.mailflow', href: '/monitoring/mailflow', permission: 'manage_tenants' },
      { id: 'monitor-security', titleKey: 'sidebar.monitorSecurity', href: '/monitoring/security', permission: 'manage_tenants' },
      { id: 'alerts', titleKey: 'sidebar.alertCenter', href: '/monitoring/alerts', permission: 'manage_tenants' },
    ],
  },
  {
    id: 'statistics',
    titleKey: 'sidebar.statistics',
    icon: PieChart,
    children: [
      { id: 'security-overview', titleKey: 'sidebar.securityOverview', href: '/statistics/security-overview' },
      { id: 'delivery-traffic', titleKey: 'sidebar.deliveryTraffic', href: '/statistics/delivery-traffic' },
      { id: 'ops-top-trend', titleKey: 'sidebar.opsTopTrend', href: '/statistics/ops-top-trend' },
      { id: 'link-attachment-security', titleKey: 'sidebar.linkAttachmentSecurity', href: '/statistics/link-attachment-security' },
    ],
  },
  {
    id: 'email-disposal',
    titleKey: 'sidebar.emailDisposal',
    icon: LogOut,
    children: [
      { id: 'disposal-center', titleKey: 'sidebar.disposalCenter', href: '/email-disposal/center' },
      { id: 'disposal-settings', titleKey: 'sidebar.disposalSettings', href: '/email-disposal/disposal-settings' },
    ],
  },
  {
    id: 'mail',
    titleKey: 'sidebar.mail',
    icon: MailOpen,
    requiresAdvancedRules: true,
    // /logs/email 与 /investigations 已从导航移除（页面保留）：两者仍是 mailflow
    // 投递页、附件安全统计卡片与 StageRulesPage 建规则后的跳转目标，只能经这些
    // 深链进入。bounce-dsn-settings / assistant 两个页面已整体下线，其后端 API
    // 一并注释待清理；quarantine-notify-settings 功能已改为租户设置驱动，表与
    // API 已于 GT-12142 删除。
    children: [
      { id: 'audit-queue', titleKey: 'sidebar.auditQueue', href: '/audit-queue' },
      { id: 'inbound-audit', titleKey: 'sidebar.inboundAudit', href: '/audit/inbound', icon: MailCheck },
      { id: 'quarantine', titleKey: 'sidebar.quarantine', href: '/quarantine' },
      { id: 'sideline', titleKey: 'sidebar.sideline', href: '/sideline' },
    ],
  },
  {
    id: 'security',
    titleKey: 'sidebar.security',
    icon: Filter,
    children: [
      { id: 'policy-pipeline', titleKey: 'sidebar.policyPipeline', href: '/security/pipeline', icon: Shield },
      { id: 'group-management', titleKey: 'sidebar.groupManagement', href: '/security/groups', icon: Tags },
    ],
  },
  {
    id: 'advanced-rules',
    titleKey: 'sidebar.advancedRules',
    icon: WandSparkles,
    requiresAdvancedRules: true,
    children: [
      {
        id: 'rules',
        titleKey: 'sidebar.rules',
        icon: Shield,
        children: [
          { id: 'rule-pipeline', titleKey: 'sidebar.rulePipelineOverview', href: '/rules/pipeline', icon: Workflow },
          { id: 'route-rules', titleKey: 'sidebar.routeRules', href: '/rules/route', icon: Route },
        ],
      },
      {
        id: 'detection',
        titleKey: 'sidebar.detection',
        icon: Search,
        children: [
          { id: 'rbl', titleKey: 'sidebar.rbl', href: '/rules/rbl', icon: Globe },
          { id: 'exec-impersonation', titleKey: 'sidebar.execImpersonation', href: '/rules/exec-impersonation', icon: UserCheck },
          { id: 'domain-lookalike', titleKey: 'sidebar.domainLookalike', href: '/rules/domain-lookalike', icon: Search },
          { id: 'similar-detection', titleKey: 'sidebar.similarDetection', href: '/rules/similar-detection', icon: Hash },
          { id: 'password-book', titleKey: 'sidebar.passwordBook', href: '/rules/password-book', icon: KeyRound },
        ],
      },
      {
        id: 'config-management',
        titleKey: 'sidebar.configManagement',
        href: '/rules/config-management',
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    id: 'agent-center',
    titleKey: 'sidebar.agentCenter',
    icon: Bot,
    children: [
      { id: 'agent-overview', titleKey: 'sidebar.agentOverview', href: '/agent-center/overview', icon: ShieldAlert },
    ],
  },
  {
    id: 'logs',
    titleKey: 'sidebar.logs',
    icon: AlertCircle,
    // NOTE: the group itself is NOT advanced-gated. Auth logs must be reachable
    // by a tenant_admin (spec §4.2), and tenant_admin has no advanced-rules
    // toggle. Per-item permission does the gating; the group renders whenever
    // a child is visible.
    children: [
      // GT-12501: 「邮件调查中心」入口按验收要求从导航隐藏（页面
      // /logs/mail-investigation 保留，同 /logs/email、/investigations 先例）。
      { id: 'auth-attempts', titleKey: 'sidebar.authAttempts', href: '/logs/auth-attempts', permission: 'view_auth_attempts' },
      { id: 'link-clicks', titleKey: 'sidebar.linkClicks', href: '/logs/link-clicks', permission: 'view_link_logs' },
      { id: 'admin-audit-logs', titleKey: 'sidebar.adminAuditLogs', href: '/logs/admin-audit', permission: 'view_admin_audit_logs' },
    ],
  },
  {
    id: 'system',
    titleKey: 'sidebar.system',
    icon: Settings,
    children: [
      // GT-12329: 邮件路由（收件域/中继/出站路由/发件认证）是平台管理员功能。
      // 页面本身早已拒绝 tenant_admin，但侧栏项此前无 permission 门 —— 产品形态
      // registry 里 forwarding 的 tenantAccess='hidden' 在**单租户形态**下是失效的
      // （resolve() 的 `viewer === 'platform' || !c.multiTenant` 短路走平台分支），
      // 而 forwarding 又是 SINGLE_ONLY，恰好只存在于单租户形态 —— 于是租户管理员
      // 仍能在菜单里看到入口、点进去撞访问拒绝页。用与同组其他平台项一致的
      // manage_tenants 门补上（manage_tenants 不在 TENANT_ADMIN_FALLBACK_PERMISSIONS
      // 里，所以空权限矩阵的粗放兜底也不会把它放行）。
      { id: 'mail-routing', titleKey: 'sidebar.mailRouting', href: '/mail-routing', permission: 'manage_tenants' },
      { id: 'tenants', titleKey: 'sidebar.tenants', href: '/tenants', permission: 'manage_tenants' },
      { id: 'proxysvr', titleKey: 'sidebar.proxysvr', href: '/system/proxysvr', permission: 'manage_tenants' },
      { id: 'system-dkim', titleKey: 'sidebar.dkimOverview', href: '/system/dkim', permission: 'manage_tenants' },
      // GT-11874: 平台安全策略入口（仅 system_admin 可见）
      { id: 'platform-security-policy', titleKey: 'sidebar.platformSecurityPolicy', href: '/system/platform-security', permission: 'manage_tenants' },
      { id: 'password-policy', titleKey: 'sidebar.passwordPolicy', href: '/system/password-policy', permission: 'manage_users' },
      // GT-11959: reachable by a tenant admin too — they hold manage_login_security
      // (for the 登录安全 tab) even though they lack manage_users (the 管理员账号 tab).
      // The page gates each tab separately.
      { id: 'users', titleKey: 'sidebar.users', href: '/users', permission: 'manage_login_security' },
      { id: 'smtp-credentials', titleKey: 'sidebar.smtpCredentials', href: '/smtp-credentials' },
      { id: 'organization-contacts', titleKey: 'sidebar.organizationContacts', href: '/organization-contacts', icon: Contact },
    ],
  },
];

// Routes that are still served but deliberately absent from the sidebar: they
// are reachable only via deep links from other pages (mailflow delivery, the
// attachment-security cards, StageRulesPage's post-save return). The brand
// subtitle resolves the active route's title from the nav tree, so without
// these it would fall back to "Dashboard" on those pages.
export const offNavRouteTitles: Array<{ href: string; titleKey: string }> = [
  { href: '/logs/email', titleKey: 'sidebar.emailLogs' },
  { href: '/investigations', titleKey: 'sidebar.investigations' },
];

// GT-12501: 泰语/俄语按验收要求从语言切换器隐藏（i18n 词典与 /th /ru
// 路由保留，恢复展示只需把条目加回来）。
export const languages = [
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
];
