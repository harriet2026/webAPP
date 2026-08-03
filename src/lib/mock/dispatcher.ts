// Mock dispatcher：把 (method, path, body, headers) 映射到 fixture 响应。
// 这是 mock 层的核心 — client.ts 的 apiRequest 命中 mock 开关后，
// 把请求委托给这里，不发起真实 fetch。

import {
  mockBootstrap,
  mockTenantStats,
  mockTenants,
  mockFilterStatistics,
  mockTypeStatistics,
  mockNodes,
  mockMonitorDashboardOverview,
  mockMonitorHardware,
  mockMonitorProcesses,
  mockMonitorContainers,
  mockMonitorDatabase,
  mockMonitorStorage,
  mockMonitorBackup,
  mockMonitorBackupDetail,
  mockMonitorRuntime,
  mockMonitorRuntimeTrend,
  mockMonitorSecurity,
  mockMailflowQueue,
  mockMailflowQueueTrend,
  mockMailflowDelivery,
  mockMailflowBounce,
  mockMailflowConnection,
  mockMailflowConnectionTrend,
  mockMailflowConnectionFailure,
  mockDashboardSummaryFor,
  mockSecurityOverviewFor,
  mockSecurityGeo,
  mockSecurityTime,
  mockSecurityDrill,
  mockSecurityEscapes,
  mockSecurityCsv,
  mockSecurityAiMarkdown,
  mockDeliveryTrafficFor,
  mockDeliveryTrafficCsv,
  mockDeliveryTrafficAi,
  mockLinkAttachmentStats,
  mockLinkAttachmentDomains,
  mockLinkAttachmentAttachments,
  mockLinkAttachmentCsv,
  mockOpsTopThreat,
  mockOpsTopFor,
  mockOpsDrilldownFor,
  mockOpsTopCsv,
  mockOpsTopAi,
  mockDashboardAlerts,
  mockGetAlert,
  mockAlertStats,
  mockMutateAlert,
  mockAlertRules,
  mockSaveAlertRule,
  mockDeleteAlertRule,
  mockAlertMetrics,
  mockAlertTemplates,
  mockAlertSmtpConfig,
  mockPutAlertSmtpConfig,
  mockDisposalPendingProbe,
  mockInboundAuditPending,
  mockPhishingStats,
  mockSpoofingStats,
  mockThreatRetroStats,
  mockSystemHealthSummary,
  spanToRange,
  type SystemStatusRangeKey,
  mockIPFrequencyRulesList,
  mockGetIPFrequencyRule,
  mockCreateIPFrequencyRule,
  mockUpdateIPFrequencyRule,
  mockDeleteIPFrequencyRule,
  mockSetIPFrequencyRuleStatus,
  mockBulkIPFrequencyRules,
  mockExportIPFrequencyRules,
  mockImportIPFrequencyRules,
  mockTestIPFrequency,
  mockRuleSuspendedIPs,
  mockSuspendedIPsList,
  mockReleaseSuspendedIP,
  mockBulkReleaseSuspendedIPs,
  mockIPFilterRulesList,
  mockIPGroupsMetaList,
  mockRBLFilterRulesList,
  mockAdminAuditList,
  mockAdminAuditStats,
  mockAuthAttemptsList,
  mockAuthAttemptStatsData,
  mockRBLDetectionProfiles,
  mockRBLFilterStats,
  mockOverseasMailConfig,
  mockGeoIpRulesList,
  mockCreateGeoIpRule,
  mockUpdateGeoIpRule,
  mockDeleteGeoIpRule,
  mockSenderFilterRulesList,
  mockSenderFilterGroupsList,
  mockGroupsMetaByType,
  mockAuthSpoofingConfig,
  mockAuthSpoofingObserveStats,
  mockAuthSpoofingProbe,
  mockBehaviorControlRulesList,
  mockBehaviorControlGroupsList,
  mockRecipientLimitConfig,
  mockRecipientCheckConfig,
  mockUserListRulesList,
  mockURLProtectionSettings,
  mockPutURLProtectionSettings,
  mockIntentEngineConfig,
  mockPutIntentEngineConfig,
  getSimilarDetectionMockState,
  putSimilarDetectionMockState,
  mockContentRulesList,
  mockContentGroupsList,
  mockCreateContentRule,
  mockUpdateContentRule,
  mockSetContentRuleStatus,
  mockCopyContentRule,
  mockDeleteContentRule,
  mockBulkContentRules,
  mockTestContentRule,
  mockContentRulesExport,
  mockPreviewContentRulesImport,
  mockExecuteContentRulesImport,
  mockMailMarkingRulesList,
  mockMailMarkingGroupsList,
  mockCreateMailMarkingRule,
  mockUpdateMailMarkingRule,
  mockDeleteMailMarkingRule,
  mockAttachmentConfigList,
  mockCreateAttachmentConfig,
  mockUpdateAttachmentConfig,
  mockAttachmentPasswordList,
  mockAddAttachmentPassword,
  mockDeleteAttachmentPassword,
  mockEmailDisposalList,
  mockEmailDisposalDetail,
  mockEmailDisposalPreview,
  mockEmailDisposalEvents,
  mockEmailDisposalSimilar,
  mockEmailDisposalMutate,
  mockEmailDisposalFields,
  mockDisposalSettingsGet,
  mockDisposalSettingsPut,
  mockRecipientGroupRulesList,
  mockContactDepartmentsList,
  mockContactSourcesList,
  mockContactSourceCreate,
  mockContactSourceUpdate,
  mockContactSourceDelete,
  mockContactSourceTest,
  mockContactSourceSetAutoSync,
  mockContactSourceSync,
  mockContactsList,
  mockContactsBulk,
  mockContactSyncLogsList,
  mockContactSyncLogDetail,
  mockRecallKeysList,
  mockRecallKeyCreate,
  mockRecallKeyDelete,
  mockGroupPolicyRulesList,
  mockUpdateGroupPolicyRule,
  mockDeleteGroupPolicyRule,
  mockLinkClickLogsList,
  mockLinkClickLogById,
  mockRoutingScope,
  mockTenantDomainsList,
  mockCreateTenantDomain,
  mockUpdateTenantDomain,
  mockDeleteTenantDomain,
  mockNexthopsList,
  mockCreateNexthop,
  mockUpdateNexthop,
  mockDeleteNexthop,
  mockProbeDomain,
  mockMailAdmissionRulesList,
  mockCreateMailAdmissionRule,
  mockUpdateMailAdmissionRule,
  mockDeleteMailAdmissionRule,
  mockMailAdmissionPolicy,
  mockSetMailAdmissionPolicy,
  mockOutboundRulesUnifiedList,
  mockUpdateOutboundRule,
  mockSetOutboundRuleStatus,
  mockDeleteOutboundRule,
  MR_OUTBOUND_RULE_ID_PATTERN,
  mockActiveProxysvrGroups,
  mockMailAuthConfigsList,
  mockCreateMailAuthConfig,
  mockUpdateMailAuthConfig,
  mockDeleteMailAuthConfig,
  mockMailAuthTest,
  mockProxysvrEndpointsList,
  mockCreateProxysvrEndpoint,
  mockUpdateProxysvrEndpoint,
  mockDeleteProxysvrEndpoint,
  mockProbeProxysvrEndpoint,
  mockProxysvrGroupsList,
  mockCreateProxysvrGroup,
  mockUpdateProxysvrGroup,
  mockDeleteProxysvrGroup,
  mockConnectivityTest,
} from './fixtures';
import {
  mockDkimSigningDomainsFor,
  mockListDkimKeys,
  mockGenerateDkimKey,
  mockImportDkimKey,
  mockVerifyDkimDns,
  mockSetDkimKeyStatus,
  mockDeleteDkimKey,
} from './dkim';
import type { DkimAlgorithm } from '@/lib/api/dkim';
import type { IPFrequencyRulePayload } from '@/types/ip-frequency';
import type { OverseasMailConfigResponse } from '@/types/overseas-mail';
import type { DisposalSettings } from '@/types/disposal-settings';
import { GROUPS_PAGE_KEY, type GroupType } from '@/types/groups';
import { GROUP_POLICY_PAGE_KEY } from '@/types/group-policy';
import type { OpsDimension, OpsTopCount } from '@/lib/api/ops-top';
import { rbacSubmodulesForScope, type RbacScope } from '@/lib/rbac/rbac-modules';
import { CONDITIONS, type PanelKind } from '@/components/security/advanced-filter-rules/catalogue';
import type { FieldDef } from '@/types/unified-rules';

export interface MockRequest {
  method: string;
  path: string; // 形如 /bootstrap、/tenants?page=1
  body?: unknown;
  headers?: Record<string, string>;
}

export interface MockResponse {
  status: number;
  data: unknown; // JSON body；204 时忽略
}

// 对 GET 路径 strip 掉 query string 后再匹配，避免 `?page=1` 这类
// 真实但与 mock 无关的参数让匹配失败。
function pathname(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '') || '/';
}

// 提取路径中 `?` 之后的原始 query string；无 query 时返回空串。
function rawQuery(path: string): string {
  const idx = path.indexOf('?');
  return idx === -1 ? '' : path.slice(idx + 1);
}

// 从 start_date/end_date 推系统状态范围键（span 0→today, ≤6→7d, else 30d）。
function rangeFromDates(path: string): SystemStatusRangeKey {
  const p = new URLSearchParams(rawQuery(path));
  const start = p.get('start_date') ?? '';
  const end = p.get('end_date') ?? '';
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  const span = Number.isNaN(s) || Number.isNaN(e) ? 0 : Math.round((e - s) / 86_400_000);
  return spanToRange(span);
}

// 解析 /admin-audit(?/stats) 的 query 为 mockAdminAuditList/Stats 的入参。
function parseAdminAuditQuery(path: string): {
  layer?: 'platform' | 'tenant';
  status?: 'success' | 'failed';
  keyword?: string;
  resource_type?: string;
  action?: string;
  tenant_id?: number;
  page?: number;
  page_size?: number;
} {
  const q = new URLSearchParams(rawQuery(path));
  const layer = q.get('layer');
  const status = q.get('status');
  const tenantId = q.get('tenant_id');
  const page = q.get('page');
  const pageSize = q.get('page_size');
  return {
    layer: layer === 'tenant' ? 'tenant' : layer === 'platform' ? 'platform' : undefined,
    status: status === 'failed' ? 'failed' : status === 'success' ? 'success' : undefined,
    keyword: q.get('keyword') || undefined,
    resource_type: q.get('resource_type') || undefined,
    action: q.get('action') || undefined,
    tenant_id: tenantId ? Number(tenantId) : undefined,
    page: page ? Number(page) : undefined,
    page_size: pageSize ? Number(pageSize) : undefined,
  };
}

type Handler = (req: MockRequest) => MockResponse;

interface Route {
  method: string | RegExp;
  // 路径模式：纯字符串精确匹配，或 RegExp。RegExp 命中即视为匹配。
  pattern: string | RegExp;
  // 可选：进一步按 query string（`?` 之后的原始串，无则为 ''）收窄匹配。
  // 用于同一个 path 下只有部分 query 被 mock 覆盖、其余必须放行到真实后端的场景
  // （例如 `/unified-rules`：只有 sender_filter 列表页和群组下拉被 mock）。
  matchQuery?: (query: string) => boolean;
  handler: Handler;
}

const mockSecurityModules: Record<string, boolean> = {
  ip_filter: true,
  ip_frequency: true,
  rbl_filter: true,
  sender_filter: true,
  user_list: true,
  auth_spoofing: true,
  content_rules: true,
  behavior_control: true,
  mail_marking: true,
  overseas_mail: true,
  similar_detection: true,
  attachment_security: true,
  advanced_rules: true,
  // demo URL检测与防护默认总开关为启用；用于统一模块注册表的 GET/PUT mock。
  url_protection: true,
};

// ─── 高级过滤规则：字段注册表 mock ─────────────────────────────────────
// 真实后端在 /unified-rules/field-definitions 返回字段注册表；mock 环境没有
// 后端，此前该端点无 handler 而落到 fallback（返回 { items:[], total:0 }，无
// fields 字段）→ 前端 fieldDefs 为空 → computeCatalogueItem 把所有 field 非
// null 的条件判为 "即将上线"。这里按 catalogue 的 CONDITIONS 合成一份注册表，
// 把每个条件用到的 field 都标为 supported，使 mock 下这些条件全部变为 "可用"。
// 仅影响 mock 模式；真实模式仍请求后端，不受影响。field 为 null 的目录项
//（如 senderOrganization "仅目录（无后端支持）"）不在此列，保持原状。
//
// panel → (type, operators, map_keys_source) 的推导仅用于让配置面板拿到合理的
// 元数据；条件的显示名走 i18n（cond_<key>），与 fd.label 无关，故 label 用
// field 名占位即可。operators 给该 panel 的常见算子，createDefaultLeaf 命中
// fd 时取首个、否则回退 PANEL_FALLBACK_OPERATOR，两条路径都安全。
// group / featureGroup 面板字段 → 群组元信息端点的映射。真实后端在 FieldDef 里
// 下发 map_keys_source（一个 API 路径），配置面板据此用 MapKeySelect 渲染「可筛选
// 下拉」。此前 mock 误把它填成裸字段名（如 "sender_group"），MapKeySelect 拿去
// 请求必然失败 → 回退成纯文本框，导致「发信人组」无法从群组策略里筛选选择。这里
// 按字段映射到正确路径：发信人组→sender、发信人 IP 组→ip、特征组→feature-groups。
// 未列入的 group 面板字段（如 GeoIP 地区）暂无群组数据面，保持原状（纯文本键输入）。
const GROUP_FIELD_META_SOURCE: Record<string, string> = {
  sender_group: '/unified-rules/_meta/groups?type=sender',
  sender_ip_group: '/unified-rules/_meta/groups?type=ip',
  feature_group: '/unified-rules/_meta/feature-groups',
};

// select 面板里语义为「是 / 否」二值判定的布尔字段（如加密附件 is_encrypted_attachment、
// ZIP 炸弹 is_zip_bomb、Mail From 为空 mailfrom_empty）。这些字段的 fieldDef 返回
// type 'boolean'，配置面板据此渲染 BooleanValueSelect（是/否 固定下拉），而非
// 结果码枚举或自由文本。其余 select 字段（spf/dkim/virus_scan 等结果码）仍为 enum。
const BOOLEAN_SELECT_FIELDS = new Set<string>(['is_encrypted_attachment', 'is_zip_bomb', 'mailfrom_empty']);

function fieldDefForPanel(field: string, panel: PanelKind): FieldDef {
  const base = { label: field, min_stage: 'data', supported: true, available: true };
  switch (panel) {
    case 'number':
      return { ...base, type: 'number', operators: ['gt', 'lt', 'eq', 'between'] };
    case 'select':
      // 二值判定字段（见 BOOLEAN_SELECT_FIELDS，如加密附件 is_encrypted_attachment /
      // ZIP 炸弹 is_zip_bomb / Mail From 为空 mailfrom_empty）语义只有「是 / 否」，返回
      // type 'boolean' 让 PanelBody 路由到 BooleanValueSelect（是/否 固定下拉，算子
      // eq/ne），杜绝自由输入产生的 true/1/yes/加密 等脏值。其余 select 字段维持 enum
      //（结果码枚举下拉，见 ConditionConfigPanel 的 ENUM_VALUES）。
      if (BOOLEAN_SELECT_FIELDS.has(field)) {
        return { ...base, type: 'boolean', operators: ['eq', 'ne'] };
      }
      return { ...base, type: 'enum', operators: ['in', 'not_in'] };
    case 'group':
    case 'featureGroup': {
      const source = GROUP_FIELD_META_SOURCE[field];
      // 真·群组字段：type 用 map_boolean，配置面板（PanelBody）据 `map_` 前缀路由到
      // MapValueSection → MapKeySelect 渲染可筛选下拉，值为「命中/未命中」的组成员判定。
      if (source) {
        return { ...base, type: 'map_boolean', operators: ['eq', 'ne'], map_keys_source: source };
      }
      // 其余 group 面板字段维持既有行为（type 'map' 不匹配 `map_` 前缀 → 纯文本键输入）。
      return { ...base, type: 'map', operators: ['in', 'not_in'], map_keys_source: field };
    }
    case 'orgDept':
      // 发件组织：按组织通讯录部门层级匹配。type 用 'string'（非 map_，配置面板
      // 走专门的 OrgDepartmentSection 部门树，不走 MapKeySelect），算子 within
      // 承载「命中所选部门及其子孙」的多值判定。
      return { ...base, type: 'string', operators: ['within'] };
    case 'cidr':
      return { ...base, type: 'cidr', operators: ['in_cidr', 'not_in_cidr'] };
    case 'time':
      return { ...base, type: 'time', operators: ['between'] };
    case 'weekday':
      return { ...base, type: 'enum', operators: ['in', 'not_in'] };
    case 'mime':
      return { ...base, type: 'string', operators: ['in', 'not_in'] };
    case 'intentEngine':
      // 意图引擎（综合研判，字段 cac_tag）：配置面板走专门的 IntentEngineSection
      // （分类优先 / 分段阈值双模式，见 ConditionConfigPanel）。operator 白名单含
      // within（分类命中意图集合）与 between（置信度落入区间）；type 'enum' 仅为占位，
      // 真正的取值渲染由 catalogue panel 决定，不经此 type 分派。
      return { ...base, type: 'enum', operators: ['within', 'between'] };
    case 'text':
    default:
      return { ...base, type: 'string', operators: ['contains', 'not_contains', 'equals', 'regex'] };
  }
}

const mockAdvancedFieldDefs: Record<string, FieldDef> = Object.fromEntries(
  CONDITIONS.filter((c) => c.field !== null).map((c) => [
    c.field as string,
    fieldDefForPanel(c.field as string, c.panel),
  ]),
);

// ─── 角色（RBAC）mock 数据 ──────────────────────────────────────────────
// 平台/租户两套内置角色。`_level` 仅用于本地生成权限矩阵，不属于 Role 线上
// 字段，列表响应里会被剥离。真实后端按 GetEffectiveTenantID 裁剪作用域，这里
// 返回全集、由页面按视角（platform/tenant）过滤。
type RoleLevel = 'admin' | 'operator' | 'viewer';
interface MockRoleSeed {
  id: number;
  code: string;
  name: string;
  scope: RbacScope;
  tenantId?: number;
  isSuperAdmin?: boolean;
  isSystemDefault: boolean;
  status: string;
  remark: string;
  _level: RoleLevel;
}

const MOCK_ROLES: MockRoleSeed[] = [
  { id: 1, code: 'platform_super_admin', name: '超级管理员', scope: 'platform', isSuperAdmin: true, isSystemDefault: true, status: 'normal', remark: '平台内置超级管理员', _level: 'admin' },
  { id: 2, code: 'platform_ops', name: '平台运维管理员', scope: 'platform', isSystemDefault: false, status: 'normal', remark: '负责平台运维', _level: 'operator' },
  { id: 3, code: 'platform_auditor', name: '平台审计员', scope: 'platform', isSystemDefault: false, status: 'normal', remark: '只读审计', _level: 'viewer' },
  { id: 101, code: 'tenant_admin', name: '租户管理员', scope: 'tenant', tenantId: 1, isSystemDefault: true, status: 'normal', remark: '租户内置管理员', _level: 'admin' },
  { id: 102, code: 'tenant_operator', name: '租户操作员', scope: 'tenant', tenantId: 1, isSystemDefault: false, status: 'normal', remark: '日常运营', _level: 'operator' },
  { id: 103, code: 'tenant_viewer', name: '租户观察员', scope: 'tenant', tenantId: 1, isSystemDefault: false, status: 'normal', remark: '只读', _level: 'viewer' },
];

/** 列表响应：剥离内部的 `_level`，保持与 Role 线上结构一致。 */
function roleListItem({ _level, ...rest }: MockRoleSeed) {
  return rest;
}

/**
 * 按角色作用域生成权限矩阵——这是让"平台视角 / 租户视角内置角色反映各自可用
 * 授权范围"的关键：矩阵覆盖的子��块集合来自 `rbacSubmodulesForScope(scope)`，
 * 平台角色得到平台专属模块（系统管理/监控等），���户角色得到租户专属模块
 * （安全策略/智能体等）。行内 can* 的粒度按角色层级区分：
 *   - admin  ：可见 + 查看/编辑/审批/删除（受子模块能力约束）
 *   - operator：可见 + 查���/编辑（审批/删除留空）
 *   - viewer ：可见 + 仅查看（只读）
 * canApprove/canDelete 对不支持该操作的子模块回落为 null（"不适用"）。
 */
function buildRoleMatrix(scope: RbacScope, level: RoleLevel) {
  return rbacSubmodulesForScope(scope).map((meta) => {
    const approveBase = meta.supportApprove ? false : null;
    const deleteBase = meta.supportDelete ? false : null;
    if (level === 'admin') {
      return {
        submoduleId: meta.id,
        visible: true,
        canView: true,
        canEdit: true,
        canApprove: meta.supportApprove ? true : null,
        canDelete: meta.supportDelete ? true : null,
      };
    }
    if (level === 'operator') {
      return { submoduleId: meta.id, visible: true, canView: true, canEdit: true, canApprove: approveBase, canDelete: deleteBase };
    }
    return { submoduleId: meta.id, visible: true, canView: true, canEdit: false, canApprove: approveBase, canDelete: deleteBase };
  });
}

// 用并表替代大 switch，便于扩展。按注册顺序遍历，第一个匹配即返回。
const routes: Route[] = [
  // 认证接口（/auth/**）刻意不 mock：登录必须走真实后端，确保拿到有效的
  // HttpOnly osgateway_token cookie，后续受保护路由的 middleware 校验才能通过。
  // 见 src/proxy.ts 的 AUTH_COOKIE 门控。

  // ─── Bootstrap ───────────────────────��──────────────────────────────────
  {
    method: 'GET',
    pattern: '/bootstrap',
    handler: () => ({ status: 200, data: mockBootstrap() }),
  },
  // 运行时版本（GT-11459）：侧栏 VersionFooter 在每个页面都会拉 /version。
  // mock 模式必须覆盖它，否则纯 mock 模式的 E2E（无 Playwright catch-all 路由）
  // 会把 /version 打到真实后端 → 假 token 401 → 全局 401 处理器跳 /zh/login，
  // 整份 spec 挂在“找不到页面标题”。
  {
    method: 'GET',
    pattern: '/version',
    handler: () => ({
      status: 200,
      data: { rev: 'mockrev0000000', built: '2026-01-01T00:00:00Z', modified: false, build_tag: 'mock' },
    }),
  },
  // 顶栏用户菜单与个人中心共用当前账号信息。纯 mock 模式必须覆盖该请求，
  // 否则顶栏新增的显示名查询会落到真实后端并因无登录 cookie 返回 401。
  {
    method: 'GET',
    pattern: '/profile/account',
    handler: () => ({
      status: 200,
      data: {
        username: 'admin',
        role: 'system_admin',
        name: '张运维',
        phone: '138****8000',
        email: 'zhangyunwei@example.com',
        lastLoginTime: '2026-07-28T08:30:00+08:00',
        lastLoginIp: '192.168.1.100',
      },
    }),
  },

  // ─── 角色列表（管理员账号 role_id 下拉 + 角色权限页）───────────────────
  // 真实后端 GET /roles 由 GetEffectiveTenantID 做作用域裁剪；纯 mock 模式下
  // 该接口原本未覆盖，dispatcher 兜底返回 { items: [] }，导致「新建管理员」
  // 抽屉里的角色下拉无可选项、点开为空（表现为“锁定/无法展开”）。这里回填
  // 平台与租户两种作用域的角色，页面再按视角（isTenantView）过滤。
  // 列表不含 permissions（与真实后端 ListRoles 一致），矩阵在详情端点返回。
  {
    method: 'GET', pattern: '/roles',
    handler: () => ({ status: 200, data: { items: MOCK_ROLES.map(roleListItem) } }),
  },
  // ─── 角色详情（点击「查看/编辑」时 useRole 拉取权限矩阵）─────────────────
  // 该端点原本未被 mock：GET /roles/:id 落到 dispatcher 兜底返回 {}（无 id），
  // RolePermissionTab 的 `roleDetail.id === editingId` 判定失败 → drawerReady
  // 恒为 false → 抽屉打不开（表现为「内置角色不可查看/编辑」）。这里按角色
  // 作用域返回对应的权限矩阵，使平台/租户内置角色分别展示各自的授权范围。
  {
    method: 'GET', pattern: /^\/roles\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const seed = MOCK_ROLES.find((r) => r.id === id);
      if (!seed) return { status: 404, data: {} };
      return {
        status: 200,
        data: { ...roleListItem(seed), permissions: buildRoleMatrix(seed.scope, seed._level) },
      };
    },
  },

  // ─── 邮件处置中心 ──────────────────────────────────────────────────────
  {
    method: 'GET', pattern: '/mail-logs/fields',
    handler: () => ({ status: 200, data: mockEmailDisposalFields() }),
  },
  {
    method: 'POST', pattern: '/mail-logs/parse-query',
    handler: (req) => {
      const description = String(((req.body ?? {}) as { description?: string }).description ?? '');
      const condition = description.includes('发件人')
        ? { field: 'sender', op: 'contains', value: description.replace(/^.*?发件人/, '').trim() || 'company' }
        : { field: 'subject', op: 'contains', value: description.trim() || '紧急' };
      return { status: 200, data: { filter: { operator: 'AND', groups: [{ operator: 'AND', conditions: [condition] }] }, summary: `已解析：${description}`, source: 'mock-deterministic-parser' } };
    },
  },
  {
    method: 'POST', pattern: '/mail-logs/similar-multi',
    handler: (req) => ({ status: 200, data: mockEmailDisposalSimilar(req.body) }),
  },
  {
    method: 'POST', pattern: '/mail-logs/bulk-dispose',
    handler: (req) => ({ status: 200, data: mockEmailDisposalMutate(req.body, 'bulk') }),
  },
  {
    method: 'POST', pattern: '/mail-logs/recall',
    handler: (req) => ({ status: 200, data: mockEmailDisposalMutate(req.body, 'recall') }),
  },
  {
    method: 'GET', pattern: /^\/mail-logs\/\d+\/preview$/,
    handler: (req) => {
      const item = mockEmailDisposalPreview(Number(pathname(req.path).split('/')[2]));
      return item ? { status: 200, data: item } : { status: 404, data: {} };
    },
  },
  {
    method: 'GET', pattern: /^\/mail-logs\/\d+\/events$/,
    handler: (req) => ({ status: 200, data: mockEmailDisposalEvents(Number(pathname(req.path).split('/')[2])) }),
  },
  {
    method: 'GET', pattern: /^\/mail-logs\/\d+\/lifecycle-logs$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const events = mockEmailDisposalEvents(id).items;
      const items = events
        .filter((event) => typeof event.raw_line === 'string' && event.raw_line.length > 0)
        .map((event) => ({
          event_uid: `mock-${event.id}`,
          message_uuid: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
          component: event.event_source,
          level: event.event_result === 'failed' ? 'error' : 'info',
          event_time: event.event_time,
          raw_line: event.raw_line as string,
        }));
      return {
        status: 200,
        data: {
          items,
          total: items.length,
          truncated: false,
          partial: false,
          searched_nodes: ['mock-node'],
          failed_nodes: [],
        },
      };
    },
  },
  {
    method: 'GET', pattern: /^\/mail-logs\/\d+\/eml$/,
    handler: (req) => ({ status: 200, data: { id: Number(pathname(req.path).split('/')[2]), content: 'Mock RFC822 message' } }),
  },
  {
    method: 'POST', pattern: /^\/mail-logs\/\d+\/notify$/,
    handler: () => ({ status: 204, data: {} }),
  },
  {
    method: 'GET', pattern: /^\/mail-logs\/\d+$/,
    handler: (req) => {
      const item = mockEmailDisposalDetail(Number(pathname(req.path).split('/')[2]));
      return item ? { status: 200, data: item } : { status: 404, data: {} };
    },
  },
  // 系统状态仪表盘的「待处置邮件」KPI 探针：page_size=1 且 advanced_filters 含
  // sideline（隔离/旁路）——只命中这一探针，不影响处置中心默认视图（其 page_size 更大）。
  // 返回按当前范围分支的 total（3/11/19），items 留空即可（KPI 卡只读 total）。
  {
    method: 'GET', pattern: '/mail-logs',
    matchQuery: (q) => {
      const p = new URLSearchParams(q);
      return p.get('page_size') === '1' && (p.get('advanced_filters') ?? '').includes('sideline');
    },
    handler: () => ({ status: 200, data: mockDisposalPendingProbe() }),
  },
  {
    method: 'GET', pattern: '/mail-logs',
    handler: (req) => ({ status: 200, data: mockEmailDisposalList(req.path) }),
  },

  // ─── 租户 ────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/tenants/_meta/stats',
    handler: () => ({ status: 200, data: mockTenantStats }),
  },
  {
    method: 'GET',
    pattern: '/tenants',
    handler: () => ({ status: 200, data: mockTenants }),
  },

  // ─── 安全模块总开关 ──────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/security/modules',
    handler: () => ({ status: 200, data: { ...mockSecurityModules } }),
  },
  {
    method: 'PUT',
    pattern: /^\/security\/modules\/[a-z_]+$/,
    handler: (req) => {
      const page = pathname(req.path).split('/')[3];
      const body = (req.body ?? {}) as { enabled?: boolean };
      mockSecurityModules[page] = body.enabled ?? true;
      return { status: 200, data: { page, enabled: mockSecurityModules[page] } };
    },
  },

  // ─── 附件安全检测 ───────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/config-overrides',
    matchQuery: (query) => new URLSearchParams(query).get('config_file') === 'attachd.cf',
    handler: (req) => ({ status: 200, data: mockAttachmentConfigList(req.path) }),
  },
  {
    method: 'POST',
    pattern: '/config-overrides',
    handler: (req) => ({
      status: 200,
      data: mockCreateAttachmentConfig((req.body ?? {}) as Parameters<typeof mockCreateAttachmentConfig>[0]),
    }),
  },
  {
    method: 'PUT',
    pattern: /^\/config-overrides\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const item = mockUpdateAttachmentConfig(id, (req.body ?? {}) as Parameters<typeof mockUpdateAttachmentConfig>[1]);
      return item ? { status: 200, data: item } : { status: 404, data: {} };
    },
  },
  {
    method: 'GET',
    pattern: '/attachment-security/antivirus/status',
    handler: () => ({ status: 200, data: { configured: true } }),
  },
  {
    method: 'POST',
    pattern: '/attachment-security/antivirus/update',
    handler: () => ({ status: 200, data: { requested: true } }),
  },
  {
    method: 'GET',
    pattern: '/attachment-security/password-book',
    handler: () => ({ status: 200, data: mockAttachmentPasswordList() }),
  },
  {
    method: 'POST',
    pattern: '/attachment-security/password-book',
    handler: (req) => ({
      status: 200,
      data: mockAddAttachmentPassword((req.body ?? {}) as Parameters<typeof mockAddAttachmentPassword>[0]),
    }),
  },
  {
    method: 'DELETE',
    pattern: /^\/attachment-security\/password-book\/\d+$/,
    handler: (req) => {
      mockDeleteAttachmentPassword(Number(pathname(req.path).split('/')[3]));
      return { status: 204, data: {} };
    },
  },

  // ─── Dashboard / 统计 ───────────────────────────────────────────────────
  // 系统状态仪表盘（/zh/dashboard）：收信总量按 start_date/end_date 分范围 +
  // 当前期/上一期（fixtures 内部按会话见过的最新 end_date 判定）。
  {
    method: 'GET',
    pattern: /^\/statistics\/dashboard/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      return {
        status: 200,
        data: mockDashboardSummaryFor(p.get('start_date') ?? '', p.get('end_date') ?? ''),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/filter/,
    handler: () => ({ status: 200, data: mockFilterStatistics }),
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/type/,
    handler: (req) => ({ status: 200, data: mockTypeStatistics(rangeFromDates(req.path)) }),
  },
  // 邮件安全总览：子资源必须放在基础路径前，保持整页 mock 数据闭环。
  {
    method: 'GET',
    pattern: /^\/statistics\/security-overview\/geo$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const response = mockSecurityGeo(p.get('threat_filter') ?? 'all');
      const country = p.get('country');
      if (country) {
        response.drill_down = {
          country,
          top_ips: ['203.0.113.42', '198.51.100.18', '192.0.2.77'].map((name, i) => ({ name, count: [486, 312, 205][i] })),
          by_threat: { phishing: 418, spam: 336, virus: 102 },
        };
      }
      return { status: 200, data: response };
    },
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/security-overview\/time-distribution$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      return { status: 200, data: mockSecurityTime(p.get('mode') === 'weekly' ? 'weekly' : 'daily', p.get('threat_filter') ?? 'all') };
    },
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/security-overview\/drill-down$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const dimension = p.get('dimension');
      const valid = dimension === 'sender_domain' || dimension === 'client_ip' || dimension === 'matched_rule' ? dimension : 'action';
      return { status: 200, data: mockSecurityDrill(valid) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/security-overview\/escapes$/,
    handler: () => ({ status: 200, data: mockSecurityEscapes }),
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/security-overview\/export\.csv$/,
    handler: () => ({ status: 200, data: mockSecurityCsv }),
  },
  {
    method: 'POST',
    pattern: /^\/statistics\/security-overview\/ai-analysis$/,
    handler: () => ({ status: 200, data: { markdown: mockSecurityAiMarkdown } }),
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/security-overview$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      return {
        status: 200,
        data: mockSecurityOverviewFor(
          p.get('start_date') ?? '',
          p.get('end_date') ?? '',
          p.get('compare_previous_period') === 'true',
          p.get('interval') ?? undefined,
        ),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/delivery-traffic$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const rawDirection = p.get('direction');
      const direction = rawDirection === 'receive' || rawDirection === 'send' || rawDirection === 'internal' ? rawDirection : 'all';
      const tenant = Number(p.get('tenant_id'));
      const startDate = p.get('start_date') ?? '';
      const endDate = p.get('end_date') ?? '';
      return { status: 200, data: mockDeliveryTrafficFor(direction, Number.isFinite(tenant) && tenant > 0 ? tenant : null, startDate, endDate) };
    },
  },
  {
    method: 'GET', pattern: '/statistics/delivery-traffic/export.csv',
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const rawDirection = p.get('direction');
      const direction = rawDirection === 'receive' || rawDirection === 'send' || rawDirection === 'internal' ? rawDirection : 'all';
      const startDate = p.get('start_date') ?? '';
      const endDate = p.get('end_date') ?? '';
      return { status: 200, data: mockDeliveryTrafficCsv(direction, startDate, endDate) };
    },
  },
  {
    method: 'POST', pattern: '/statistics/delivery-traffic/ai-analysis',
    handler: () => ({ status: 200, data: mockDeliveryTrafficAi() }),
  },
  // 链接与附件安全：子资源必须排在聚合路径之前，保证整页 mock 数据闭环。
  {
    method: 'GET', pattern: '/statistics/link-attachment-security/top-malicious-domains',
    handler: (req) => {
      const limit = Number(new URLSearchParams(rawQuery(req.path)).get('limit')) || 5;
      return { status: 200, data: mockLinkAttachmentDomains(limit) };
    },
  },
  {
    method: 'GET', pattern: '/statistics/link-attachment-security/top-malicious-attachments',
    handler: (req) => {
      const limit = Number(new URLSearchParams(rawQuery(req.path)).get('limit')) || 5;
      return { status: 200, data: mockLinkAttachmentAttachments(limit) };
    },
  },
  {
    method: 'POST', pattern: '/statistics/link-attachment-security/blacklist-domain',
    handler: () => ({ status: 200, data: { created: true } }),
  },
  {
    method: 'GET', pattern: '/statistics/link-attachment-security/export.csv',
    handler: () => ({ status: 200, data: mockLinkAttachmentCsv() }),
  },
  {
    method: 'GET', pattern: '/statistics/link-attachment-security',
    handler: () => ({ status: 200, data: mockLinkAttachmentStats() }),
  },
  // 运营 TOP 与趋势：页面、下钻、导出与 AI mock 全覆盖；sort=threat
  // 仍保留给系统状态页的威胁来源 TOP5 专用 fixture。
  {
    method: 'GET',
    pattern: /^\/statistics\/ops-top\/drilldown$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const tenant = req.headers?.['X-Tenant-ID'] ?? req.headers?.['x-tenant-id'] ?? 'all';
      return {
        status: 200,
        data: mockOpsDrilldownFor(p.get('sub_dim') ?? '', tenant, p.get('key') ?? 'none'),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/ops-top\/export\.csv$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const tenant = req.headers?.['X-Tenant-ID'] ?? req.headers?.['x-tenant-id'] ?? 'all';
      const dimension = (p.get('dimension') ?? 'connection') as OpsDimension;
      const top = (p.get('top') ?? '10') as OpsTopCount;
      return {
        status: 200,
        data: mockOpsTopCsv(mockOpsTopFor(dimension, top, tenant, p.get('time_range') ?? '7d')),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/statistics\/ops-top\/ai-analysis$/,
    handler: () => ({ status: 200, data: mockOpsTopAi() }),
  },
  {
    method: 'GET',
    pattern: /^\/statistics\/ops-top$/,
    handler: (req) => {
      const p = new URLSearchParams(rawQuery(req.path));
      const tr = p.get('time_range');
      const range: SystemStatusRangeKey = tr === '7d' || tr === '30d' ? tr : 'today';
      if (p.get('sort') === 'threat') {
        return { status: 200, data: mockOpsTopThreat(range) };
      }
      const tenant = req.headers?.['X-Tenant-ID'] ?? req.headers?.['x-tenant-id'] ?? 'all';
      return {
        status: 200,
        data: mockOpsTopFor(
          (p.get('dimension') ?? 'connection') as OpsDimension,
          (p.get('top') ?? '10') as OpsTopCount,
          tenant,
          tr ?? '7d',
        ),
      };
    },
  },

  // ─── 监控 ────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/monitor-dashboard/overview',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('range');
      const range = value === '24h' || value === '7d' || value === '30d' ? value : 'today';
      return { status: 200, data: mockMonitorDashboardOverview(range) };
    },
  },
  {
    method: 'GET',
    pattern: '/monitor/nodes',
    handler: () => ({ status: 200, data: mockNodes }),
  },
  {
    method: 'GET',
    pattern: '/monitor/hardware',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('range');
      const range = value === '1h' || value === '7d' ? value : '24h';
      return { status: 200, data: mockMonitorHardware(range) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/processes',
    handler: () => ({ status: 200, data: mockMonitorProcesses }),
  },
  {
    method: 'GET', pattern: '/monitor/docker-containers',
    handler: () => ({ status: 200, data: mockMonitorContainers }),
  },
  {
    method: 'GET',
    pattern: '/monitor/database',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('range');
      const range = value === '1h' || value === '7d' ? value : '24h';
      return { status: 200, data: mockMonitorDatabase(range) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/storage',
    handler: () => ({ status: 200, data: mockMonitorStorage }),
  },
  {
    method: 'GET', pattern: '/monitor/backup',
    handler: () => ({ status: 200, data: mockMonitorBackup }),
  },
  {
    method: 'GET', pattern: /^\/monitor\/backup\/[^/]+$/,
    handler: (req) => {
      const id = decodeURIComponent(pathname(req.path).split('/').pop() ?? '');
      const detail = mockMonitorBackupDetail(id);
      return detail
        ? { status: 200, data: detail }
        : { status: 404, data: { error: { code: 'not_found', message: 'backup task not found' } } };
    },
  },
  {
    method: 'GET', pattern: '/monitor/runtime',
    handler: () => ({ status: 200, data: mockMonitorRuntime }),
  },
  {
    method: 'GET', pattern: '/monitor/runtime-trend',
    handler: () => ({ status: 200, data: mockMonitorRuntimeTrend }),
  },
  {
    method: 'GET', pattern: '/monitor/security',
    handler: (req) => {
      const query = new URLSearchParams(rawQuery(req.path));
      const engineValue = query.get('engine');
      const engine = engineValue === 'antivirus' || engineValue === 'sandbox' || engineValue === 'rbl' ? engineValue : 'antispam';
      const rangeValue = query.get('range');
      const range = rangeValue === '7d' || rangeValue === '30d' ? rangeValue : '24h';
      return { status: 200, data: mockMonitorSecurity(engine, range) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/queue',
    handler: (req) => {
      const query = new URLSearchParams(rawQuery(req.path));
      const rangeValue = query.get('range');
      const range = rangeValue === '1h' || rangeValue === '7d' ? rangeValue : '24h';
      const directionValue = query.get('direction');
      const direction = directionValue === 'all' || directionValue === 'send' || directionValue === 'internal' ? directionValue : 'receive';
      return { status: 200, data: mockMailflowQueue(range, direction) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/queue/trend',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('range');
      const range = value === '1h' || value === '7d' ? value : '24h';
      return { status: 200, data: mockMailflowQueueTrend(range) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/delivery',
    handler: (req) => {
      const query = new URLSearchParams(rawQuery(req.path));
      const rangeValue = query.get('range');
      const range = rangeValue === '1h' || rangeValue === '7d' ? rangeValue : '24h';
      const directionValue = query.get('direction');
      const direction = directionValue === 'all' || directionValue === 'send' || directionValue === 'internal' ? directionValue : 'receive';
      return { status: 200, data: mockMailflowDelivery(range, direction) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/bounce',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('direction');
      const direction = value === 'all' || value === 'send' || value === 'internal' ? value : 'receive';
      return { status: 200, data: mockMailflowBounce(direction) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/connection',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('direction');
      const direction = value === 'all' || value === 'send' || value === 'internal' ? value : 'receive';
      return { status: 200, data: mockMailflowConnection(direction) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/connection/trend',
    handler: (req) => {
      const query = new URLSearchParams(rawQuery(req.path));
      const rangeValue = query.get('range');
      const range = rangeValue === '1h' || rangeValue === '7d' ? rangeValue : '24h';
      const directionValue = query.get('direction');
      const direction = directionValue === 'all' || directionValue === 'send' || directionValue === 'internal' ? directionValue : 'receive';
      return { status: 200, data: mockMailflowConnectionTrend(range, direction) };
    },
  },
  {
    method: 'GET', pattern: '/monitor/mailflow/connection/failure',
    handler: (req) => {
      const value = new URLSearchParams(rawQuery(req.path)).get('direction');
      const direction = value === 'all' || value === 'send' || value === 'internal' ? value : 'receive';
      return { status: 200, data: mockMailflowConnectionFailure(direction) };
    },
  },
  // 告警中心：maintained html_spec 所需的完整 mock API 契约。
  {
    method: 'GET',
    pattern: '/monitor/alerts',
    handler: (req) => ({ status: 200, data: mockDashboardAlerts(rawQuery(req.path)) }),
  },
  {
    method: 'GET',
    pattern: '/monitor/alerts/stats',
    handler: () => ({ status: 200, data: mockAlertStats() }),
  },
  {
    method: 'GET',
    pattern: /^\/monitor\/alerts\/\d+$/,
    handler: (req) => {
      const match = pathname(req.path).match(/^\/monitor\/alerts\/(\d+)$/);
      const alert = match ? mockGetAlert(Number(match[1])) : undefined;
      return alert
        ? { status: 200, data: alert }
        : { status: 404, data: { message: 'alert not found' } };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/monitor\/alerts\/\d+\/(confirm|process|resolve)$/,
    handler: (req) => {
      const match = pathname(req.path).match(/^\/monitor\/alerts\/(\d+)\/(confirm|process|resolve)$/);
      if (!match) return { status: 404, data: { message: 'alert not found' } };
      const action = match[2] as 'confirm' | 'process' | 'resolve';
      return mockMutateAlert(Number(match[1]), action)
        ? { status: 204, data: {} }
        : { status: 409, data: { message: 'alert lifecycle conflict' } };
    },
  },
  {
    method: 'POST',
    pattern: '/monitor/alerts/batch',
    handler: (req) => {
      const body = req.body as { action?: 'confirm' | 'resolve'; ids?: number[] };
      if (body.action !== 'confirm' && body.action !== 'resolve') {
        return { status: 400, data: { message: 'invalid batch action' } };
      }
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const success = ids.filter((id) => mockMutateAlert(id, body.action!)).length;
      return { status: 200, data: { success, failed: ids.length - success } };
    },
  },
  {
    method: 'GET',
    pattern: '/monitor/alert-rules/templates',
    handler: () => ({ status: 200, data: mockAlertTemplates() }),
  },
  {
    method: 'GET',
    pattern: '/monitor/alert-rules/metrics',
    handler: () => ({ status: 200, data: mockAlertMetrics() }),
  },
  {
    method: 'GET',
    pattern: '/monitor/alert-rules',
    handler: () => ({ status: 200, data: mockAlertRules() }),
  },
  {
    method: 'POST',
    pattern: '/monitor/alert-rules',
    handler: (req) => ({ status: 200, data: mockSaveAlertRule(req.body as Parameters<typeof mockSaveAlertRule>[0]) }),
  },
  {
    method: 'PUT',
    pattern: /^\/monitor\/alert-rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/').pop());
      return { status: 200, data: mockSaveAlertRule(req.body as Parameters<typeof mockSaveAlertRule>[0], id) };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/monitor\/alert-rules\/\d+$/,
    handler: (req) => {
      mockDeleteAlertRule(Number(pathname(req.path).split('/').pop()));
      return { status: 204, data: {} };
    },
  },
  {
    method: 'GET',
    pattern: '/monitor/alert-smtp-config',
    handler: () => ({ status: 200, data: mockAlertSmtpConfig() }),
  },
  {
    method: 'PUT',
    pattern: '/monitor/alert-smtp-config',
    handler: (req) => ({ status: 200, data: mockPutAlertSmtpConfig(req.body as Parameters<typeof mockPutAlertSmtpConfig>[0]) }),
  },
  {
    method: 'POST',
    pattern: '/monitor/alert-smtp-config/test',
    handler: () => ({ status: 200, data: { success: true, message: '测试邮件发送成功' } }),
  },

  // ─── IP 频率限制（mock 数据用于无后端的开发/演示）────────────────────────
  {
    method: 'GET',
    pattern: '/ip-frequency/rules',
    handler: (req) => {
      // 把 query string 解析成对象供 list 函数过滤
      const params: Record<string, string> = {};
      const qs = req.path.split('?')[1];
      if (qs) {
        for (const part of qs.split('&')) {
          const [k, v] = part.split('=');
          if (k) params[k] = decodeURIComponent(v || '');
        }
      }
      const isActive =
        params.is_active === 'true'
          ? true
          : params.is_active === 'false'
            ? false
            : undefined;
      const page = params.page ? Number(params.page) : undefined;
      const pageSize = params.page_size
        ? Number(params.page_size)
        : undefined;
      return {
        status: 200,
        data: mockIPFrequencyRulesList({
          page,
          page_size: pageSize,
          q: params.q || params.search,
          scope_type: params.scope_type,
          is_active: isActive,
        }),
      };
    },
  },

  // 单规则挂起 IP 列表
  {
    method: 'GET',
    pattern: /^\/ip-frequency\/rules\/\d+\/suspended-ips$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      return { status: 200, data: mockRuleSuspendedIPs(id) };
    },
  },
  // 切换启用状态
  {
    method: 'PUT',
    pattern: /^\/ip-frequency\/rules\/\d+\/status$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      const body = (req.body ?? {}) as { is_active?: boolean };
      return { status: 200, data: mockSetIPFrequencyRuleStatus(id, body.is_active ?? false) };
    },
  },
  // 导出 / 批量 / 导入 / 测试（精确串，均为非数字子路径，不与 {id} 正则冲突）
  {
    method: 'GET',
    pattern: '/ip-frequency/rules/export',
    handler: () => ({ status: 200, data: mockExportIPFrequencyRules() }),
  },
  {
    method: 'POST',
    pattern: '/ip-frequency/rules/bulk',
    handler: (req) => ({
      status: 200,
      data: mockBulkIPFrequencyRules(
        (req.body ?? { action: 'toggle', ids: [] }) as {
          action: 'delete' | 'toggle';
          ids: number[];
          is_active?: boolean;
        },
      ),
    }),
  },
  {
    method: 'POST',
    pattern: '/ip-frequency/rules/import',
    handler: (req) => ({
      status: 200,
      data: mockImportIPFrequencyRules((req.body ?? { rules: [] }) as { rules: IPFrequencyRulePayload[] }),
    }),
  },
  {
    method: 'POST',
    pattern: '/ip-frequency/rules/test',
    handler: (req) => {
      const body = (req.body ?? {}) as { test_ip?: string; action?: string };
      return {
        status: 200,
        data: mockTestIPFrequency({ test_ip: body.test_ip ?? '', action: body.action ?? 'reject' }),
      };
    },
  },
  // 新建规则
  {
    method: 'POST',
    pattern: '/ip-frequency/rules',
    handler: (req) => ({
      status: 200,
      data: mockCreateIPFrequencyRule((req.body ?? {}) as IPFrequencyRulePayload),
    }),
  },
  // 单规则 读 / 改 / 删（数字 id）
  {
    method: 'GET',
    pattern: /^\/ip-frequency\/rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      const rule = mockGetIPFrequencyRule(id);
      return rule ? { status: 200, data: rule } : { status: 404, data: {} };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/ip-frequency\/rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      const rule = mockUpdateIPFrequencyRule(id, (req.body ?? {}) as IPFrequencyRulePayload);
      return rule ? { status: 200, data: rule } : { status: 404, data: {} };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/ip-frequency\/rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      const body = (req.body ?? {}) as { release_suspended?: boolean };
      mockDeleteIPFrequencyRule(id, body.release_suspended === true);
      return { status: 204, data: {} };
    },
  },
  // 全局挂起 IP：列表 / 解封 / 批量解封
  {
    method: 'GET',
    pattern: '/ip-frequency/suspended-ips',
    handler: () => ({ status: 200, data: mockSuspendedIPsList() }),
  },
  {
    method: 'POST',
    pattern: '/ip-frequency/suspended-ips/release',
    handler: (req) => {
      const body = (req.body ?? {}) as { ip?: string };
      return { status: 200, data: mockReleaseSuspendedIP(body.ip ?? '') };
    },
  },
  {
    method: 'POST',
    pattern: '/ip-frequency/suspended-ips/bulk-release',
    handler: (req) => ({
      status: 200,
      data: mockBulkReleaseSuspendedIPs(
        (req.body ?? {}) as { ips?: string[]; rule_id?: number; all?: boolean },
      ),
    }),
  },

  // ─── IP 黑白名单（mock）────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/ip-filter/rules',
    handler: (req) => {
      const params: Record<string, string> = {};
      const qs = req.path.split('?')[1];
      if (qs) {
        for (const part of qs.split('&')) {
          const [k, v] = part.split('=');
          if (k) params[k] = decodeURIComponent(v || '');
        }
      }
      const isActive =
        params.is_active === 'true'
          ? true
          : params.is_active === 'false'
            ? false
            : undefined;
      const page = params.page ? Number(params.page) : undefined;
      const pageSize = params.page_size
        ? Number(params.page_size)
        : undefined;
      const listType =
        params.list_type === 'blacklist' || params.list_type === 'whitelist'
          ? (params.list_type as 'blacklist' | 'whitelist')
          : undefined;
      return {
        status: 200,
        data: mockIPFilterRulesList({
          page,
          page_size: pageSize,
          q: params.q,
          list_type: listType,
          is_active: isActive,
        }),
      };
    },
  },

  // ─── 全局 IP 组元信息（GT-11464 expression 组多选，mock）────────────────────
  // 只接管 type=ip；其他 type 落到通用 fallback（返回空 items），不影响别的页面。
  {
    method: 'GET',
    pattern: '/unified-rules/_meta/groups',
    matchQuery: (q) => /(^|&)type=ip($|&)/.test(q),
    handler: () => ({
      status: 200,
      data: mockIPGroupsMetaList(),
    }),
  },

  // ─── 群组元信息（发信人组等，高级过滤规则 group 面板下拉数据源）────────────────
  // 复用群组管理 / 群组策略同源的 mockSenderFilterGroupsList，按 type 派生。只接管
  // sender/recipient/content；type=ip 由上面的 mockIPGroupsMetaList 接管（更完整的
  // 独立列表），互不重叠。这样「发信人组」条件即可从群组策略的发信人组里筛选选择。
  {
    method: 'GET',
    pattern: '/unified-rules/_meta/groups',
    matchQuery: (q) => /(^|&)type=(sender|recipient|content)($|&)/.test(q),
    handler: (req) => {
      const type = (/(?:^|&)type=(\w+)/.exec(rawQuery(req.path))?.[1] ?? 'sender') as GroupType;
      return { status: 200, data: mockGroupsMetaByType(type) };
    },
  },

  // ─── 特征组元信息（真实端点 GET /unified-rules/_meta/feature-groups）──────────
  {
    method: 'GET',
    pattern: '/unified-rules/_meta/feature-groups',
    handler: () => ({ status: 200, data: mockGroupsMetaByType('feature') }),
  },

  // ─── RBL 过滤（mock）────────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/rbl-filter/rules',
    handler: (req) => {
      const params: Record<string, string> = {};
      const qs = req.path.split('?')[1];
      if (qs) {
        for (const part of qs.split('&')) {
          const [k, v] = part.split('=');
          if (k) params[k] = decodeURIComponent(v || '');
        }
      }
      const isActive =
        params.is_active === 'true'
          ? true
          : params.is_active === 'false'
            ? false
            : undefined;
      const page = params.page ? Number(params.page) : undefined;
      const pageSize = params.page_size
        ? Number(params.page_size)
        : undefined;
      const matchMode =
        params.match_mode === 'any' || params.match_mode === 'specific'
          ? (params.match_mode as 'any' | 'specific')
          : undefined;
      const productAction =
        params.product_action === 'block' ||
        params.product_action === 'quarantine' ||
        params.product_action === 'mark'
          ? (params.product_action as 'block' | 'quarantine' | 'mark')  // 旧枚举，与 mock 存量数据保持一致
          : undefined;
      return {
        status: 200,
        data: mockRBLFilterRulesList({
          page,
          page_size: pageSize,
          q: params.q,
          match_mode: matchMode,
          product_action: productAction,
          is_active: isActive,
        }),
      };
    },
  },
  {
    method: 'GET',
    pattern: '/rbl-filter/stats',
    handler: () => ({ status: 200, data: mockRBLFilterStats(7) }),
  },

  // ─── 管理���操作日志（mock）──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/admin-audit',
    handler: (req) => ({ status: 200, data: mockAdminAuditList(parseAdminAuditQuery(req.path)) }),
  },
  {
    method: 'GET',
    pattern: '/admin-audit/stats',
    handler: (req) => ({ status: 200, data: mockAdminAuditStats(parseAdminAuditQuery(req.path)) }),
  },
  {
    method: 'GET',
    pattern: '/detection-profiles',
    handler: () => ({ status: 200, data: mockRBLDetectionProfiles }),
  },

  // ─── 海外邮件检测（mock）──────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/overseas-mail/config',
    handler: () => ({ status: 200, data: mockOverseasMailConfig() }),
  },
  {
    method: 'PUT',
    pattern: '/overseas-mail/config',
    handler: (req) => {
      const body = (req.body ?? {}) as Partial<OverseasMailConfigResponse>;
      const current = mockOverseasMailConfig();
      return {
        status: 200,
        data: {
          directions: body.directions ?? current.directions,
          hit_stats: current.hit_stats,
        },
      };
    },
  },

  // ─── 自定义 IP 定位库（GeoIP rules，mock）────────────────────────────────
  {
    method: 'GET',
    pattern: '/geoip-rules',
    handler: (req) => {
      const params: Record<string, string> = {};
      const qs = req.path.split('?')[1];
      if (qs) {
        for (const part of qs.split('&')) {
          const [k, v] = part.split('=');
          if (k) params[k] = decodeURIComponent(v || '');
        }
      }
      const page = params.page ? Number(params.page) : undefined;
      const pageSize = params.page_size ? Number(params.page_size) : undefined;
      return {
        status: 200,
        data: mockGeoIpRulesList({
          page,
          page_size: pageSize,
          q: params.q || params.search,
        }),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/geoip-rules',
    handler: (req) => ({
      status: 201,
      data: mockCreateGeoIpRule(
        (req.body ?? {}) as { ip_range?: string; region_code?: string; region_name?: string },
      ),
    }),
  },
  {
    method: 'PUT',
    pattern: /^\/geoip-rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const body = (req.body ?? {}) as { ip_range?: string; region_code?: string; region_name?: string };
      const rule = mockUpdateGeoIpRule(id, body);
      return rule ? { status: 200, data: rule } : { status: 404, data: {} };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/geoip-rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      mockDeleteGeoIpRule(id);
      return { status: 204, data: {} };
    },
  },

  // ─── 统一规则系统（sender_filter 页 + behavior_control 页 + 群组下拉）────
  // `/unified-rules` 被多个模块共用（sender_filter 规则列表、群组下拉、
  // behavior_control、advanced_rules、user_list、mail_marking，以及
  // src/lib/api/unified-rules.ts 的通用 getUnifiedRules）。这里 mock 了这些
  // query 形态：sender_filter 列表页（`rule_page=sender_filter`）、
  // behavior_control 列表页（`rule_page=behavior_control`）和群组下拉
  // （`page=<GROUPS_PAGE_KEY>`，注意参数名是 `page`，不是 `rule_page`）。
  // 群组下拉又有两个来源，靠 `include` 参数分流、互不污染：
  //   - sender_filter 的 `GROUPS_LIST_QUERY`（src/lib/api/groups.ts）发
  //     `include=member_count,reference_count` → 返回 `mockSenderFilterGroupsList()`；
  //   - behavior-control 抽屉（BehaviorControlDrawer.tsx 的 groupsQuery）发
  //     `include=member_count`（恰好这个值）→ 返回 `mockBehaviorControlGroupsList()`
  //     （sender/ip/org 三类）。
  // 用 `matchQuery` 精确收窄到这些 query（用 URLSearchParams 按参数值匹配，而非
  // 子串 `.includes`，避免误伤例如 `rule_page=groups` 这类恰好含有子串但语义
  // 不同的查询），其余模块的 `/unified-rules` GET 一律不 mockable，继续放行到
  // 真实后端 —— 保持它们 "接口缺失 → 由后端返回真实数据/错误" 的原有行为，
  // 不再落到本路由的空壳。
  // 高级过滤规则条件配置的字段注册表（GET /unified-rules/field-definitions）。
  // 精确 path，pathname 已 strip query，无需 matchQuery。返回合成的可用字段集，
  // 让 mock 下条件目录不再全是 "即将上线"。
  {
    method: 'GET',
    pattern: '/unified-rules/field-definitions',
    handler: () => ({ status: 200, data: { fields: mockAdvancedFieldDefs } }),
  },
  {
    method: 'GET',
    pattern: '/unified-rules',
    matchQuery: (q) => {
      const params = new URLSearchParams(q);
      return (
        params.get('rule_page') === 'sender_filter' ||
        params.get('rule_page') === 'behavior_control' ||
        params.get('rule_page') === 'user_list' ||
        params.get('rule_page') === 'content_rules' ||
        params.get('rule_page') === 'mail_marking' ||
        params.get('rule_page') === 'groups' ||
        params.get('page') === GROUPS_PAGE_KEY ||
        params.get('page') === GROUP_POLICY_PAGE_KEY
      );
    },
    handler: (req) => {
      const params = new URLSearchParams(rawQuery(req.path));
      // 群组策略规则列表（page=group_policy，html_spec filter-rules-group-policy）
      if (params.get('page') === GROUP_POLICY_PAGE_KEY) {
        return { status: 200, data: mockGroupPolicyRulesList() };
      }
      if (params.get('page') === GROUPS_PAGE_KEY) {
        if (params.get('group_type') === 'content') {
          return { status: 200, data: mockContentGroupsList() };
        }
        if (params.get('include') === 'member_count') {
          return { status: 200, data: mockBehaviorControlGroupsList() };
        }
        // 这是 src/lib/api/groups.ts 的 GROUPS_LIST_QUERY 落地的兜底分支
        // （group_management_page / sender-filter 群组下拉 / group-policy-drawer /
        // admission-rule-sheet 的收件人+内容群组下拉共用同一个 query，客户端各自
        // 按 ruleToGroup 返回的 type 再筛选）。原先这里只有 sender/ip 两类
        // （mockSenderFilterGroupsList 的 3 条），现在把处置设置用到的收信人组
        // （mockRecipientGroupRulesList 的 9001-9005）并入同一个组合列表，而不是
        // 整体替换掉——否则会砸掉 sender_filter 自己的群组弹窗和群组管理页的
        // ip/sender 分页（保持既有分支不回归）。content 组同理并入，补齐
        // admission-rule-sheet 内容群组下拉此前一直为空的既有缺口。
        return {
          status: 200,
          data: {
            items: [
              ...mockSenderFilterGroupsList().items,
              ...mockRecipientGroupRulesList().items,
              ...mockContentGroupsList().items,
            ],
          },
        };
      }
      if (params.get('rule_page') === 'groups') return { status: 200, data: mockMailMarkingGroupsList() };
      if (params.get('rule_page') === 'mail_marking') return { status: 200, data: mockMailMarkingRulesList() };
      if (params.get('rule_page') === 'user_list') return { status: 200, data: mockUserListRulesList() };
      if (params.get('rule_page') === 'behavior_control') return { status: 200, data: mockBehaviorControlRulesList() };
      if (params.get('rule_page') === 'content_rules') return { status: 200, data: mockContentRulesList(params) };
      return { status: 200, data: mockSenderFilterRulesList() };
    },
  },
  {
    method: 'POST',
    pattern: '/unified-rules',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'mail_marking',
    handler: (req) => ({ status: 201, data: mockCreateMailMarkingRule(req.body) }),
  },
  {
    method: 'PUT',
    pattern: /^\/unified-rules\/\d+$/,
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'mail_marking',
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const rule = mockUpdateMailMarkingRule(id, req.body);
      return rule ? { status: 200, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/unified-rules\/\d+$/,
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'mail_marking',
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteMailMarkingRule(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'POST',
    pattern: '/unified-rules/test',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'mail_marking',
    handler: () => ({ status: 200, data: { matched: true } }),
  },
  {
    method: 'POST',
    pattern: '/unified-rules',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => ({ status: 201, data: mockCreateContentRule(req.body) }),
  },
  {
    method: 'PUT',
    pattern: /^\/unified-rules\/\d+$/,
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const rule = mockUpdateContentRule(id, req.body);
      return rule ? { status: 200, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/unified-rules\/\d+\/status$/,
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const body = (req.body ?? {}) as { is_active?: boolean };
      const rule = mockSetContentRuleStatus(id, body.is_active ?? true);
      return rule ? { status: 200, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'POST',
    pattern: /^\/unified-rules\/\d+\/copy$/,
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const rule = mockCopyContentRule(id);
      return rule ? { status: 201, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  // ─── 群组策略规则的写操作（mock id 段 9001-9099，按 id 命名空间收窄）────
  // 群组策略的 PUT/DELETE 不带 scope query，无法像 mail_marking 那样按 query 收窄；
  // 用 mock 专属 id 段做路由收窄：只有 mock 列表返回的 9xxx id 会命中这里，
  // 其余模块对 /unified-rules/{id} 的无 scope 写操作照旧放行到真实后端。
  // POST（新建）无 id 可收窄，保持放行——mock 模式下新建会写到真实后端，
  // 列表仍来自 fixture（有意取舍，见 design/implement/spec/2026-07-18 群组策略对齐 spec）。
  {
    method: 'PUT',
    pattern: /^\/unified-rules\/90\d\d$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const rule = mockUpdateGroupPolicyRule(id, req.body);
      return rule ? { status: 200, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/unified-rules\/90\d\d$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteGroupPolicyRule(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/unified-rules\/\d+$/,
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteContentRule(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'POST',
    pattern: '/unified-rules/bulk',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => {
      const ids = mockBulkContentRules(req.body);
      return { status: 200, data: { message: 'ok', deleted: ids, failed: [] } };
    },
  },
  {
    method: 'POST',
    pattern: '/unified-rules/test',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => ({ status: 200, data: mockTestContentRule(req.body) }),
  },
  {
    method: 'GET',
    pattern: '/unified-rules/export',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: () => ({ status: 200, data: mockContentRulesExport() }),
  },
  {
    method: 'POST',
    pattern: '/unified-rules/import/preview',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => ({ status: 200, data: mockPreviewContentRulesImport(req.body) }),
  },
  {
    method: 'POST',
    pattern: '/unified-rules/import',
    matchQuery: (q) => new URLSearchParams(q).get('scope') === 'content_rules',
    handler: (req) => ({ status: 200, data: mockExecuteContentRulesImport(req.body) }),
  },
  // 邮件路由出站规则（mock id 段 5000-5999）：必须排在下面通用的无 scope
  // DELETE 兜底之前，否则会被那条更早注册���同样匹配 \d+ 的路由吞掉，
  // 导致状态假装删除成功但 outboundRulesState 从未真正变化。
  {
    method: 'DELETE',
    pattern: /^\/unified-rules\/(5\d{3})$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteOutboundRule(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/unified-rules\/\d+$/,
    handler: () => ({ status: 200, data: { status: 'deleted' } }),
  },
  {
    method: 'POST',
    pattern: '/unified-rules/bulk',
    handler: (req) => {
      const body = (req.body ?? {}) as { action?: string; ids?: number[] };
      const ids = body.ids ?? [];
      if (body.action === 'delete' && ids.length > 1000)
        return { status: 400, data: { error: 'too_many', message: 'max 1000' } };
      // bulk delete/enable/disable：mock 不改 fixture，返回加字段的 deleted/failed（含 message 兼容既有调用方）
      return { status: 200, data: { message: 'ok', deleted: ids, failed: [] } };
    },
  },
  {
    method: 'GET',
    pattern: '/behavior-control/recipient-limit-config',
    handler: () => ({ status: 200, data: mockRecipientLimitConfig() }),
  },
  {
    method: 'PUT',
    pattern: '/behavior-control/recipient-limit-config',
    handler: () => ({ status: 200, data: { status: 'updated' } }),
  },
  {
    method: 'DELETE',
    pattern: '/behavior-control/recipient-limit-config',
    handler: () => ({ status: 200, data: { status: 'deleted' } }),
  },
  {
    method: 'GET',
    pattern: '/behavior-control/recipient-check-config',
    handler: () => ({ status: 200, data: mockRecipientCheckConfig() }),
  },
  {
    method: 'PUT',
    pattern: '/behavior-control/recipient-check-config',
    handler: () => ({ status: 200, data: { status: 'updated' } }),
  },
  {
    method: 'DELETE',
    pattern: '/behavior-control/recipient-check-config',
    handler: () => ({ status: 200, data: { status: 'deleted' } }),
  },

  // ─── 身份认证与仿冒防护（auth-spoofing，mock）──────────────────────────────
  {
    method: 'GET',
    pattern: '/auth-spoofing/config',
    handler: () => ({ status: 200, data: mockAuthSpoofingConfig() }),
  },
  {
    method: 'PUT',
    pattern: '/auth-spoofing/config',
    handler: () => ({ status: 200, data: { ok: true, warnings: [] } }),
  },
  {
    method: 'DELETE',
    pattern: '/auth-spoofing/config',
    handler: () => ({ status: 200, data: { ok: true } }),
  },
  {
    method: 'GET',
    pattern: /^\/auth-spoofing\/observe-stats/,
    handler: (req) => {
      const params = new URLSearchParams(rawQuery(req.path));
      const days = params.get('days') ? Number(params.get('days')) : 7;
      return { status: 200, data: mockAuthSpoofingObserveStats(days) };
    },
  },
  {
    method: 'POST',
    pattern: '/auth-spoofing/probe',
    handler: () => ({ status: 200, data: mockAuthSpoofingProbe() }),
  },

  // ─── URL检测与防护（url-protection，mock）──────────────────────────────
  {
    method: 'GET',
    pattern: '/url-protection/settings',
    handler: () => ({ status: 200, data: mockURLProtectionSettings() }),
  },
  {
    method: 'PUT',
    pattern: '/url-protection/settings',
    handler: (req) => ({
      status: 200,
      data: mockPutURLProtectionSettings((req.body ?? {}) as Record<string, unknown>),
    }),
  },

  // ─── 意图引擎（intent-engine，mock）──────────────────────────────────
  {
    method: 'GET',
    pattern: '/security/intent-engine',
    handler: () => ({ status: 200, data: mockIntentEngineConfig() }),
  },
  {
    method: 'PUT',
    pattern: '/security/intent-engine',
    handler: (req) => ({
      status: 200,
      data: mockPutIntentEngineConfig((req.body ?? {}) as Record<string, unknown>),
    }),
  },

  // ─── 相似检测（similar-detection，mock）──────────────────────────────
  {
    method: 'GET',
    pattern: '/security/similar-detection',
    handler: () => ({ status: 200, data: getSimilarDetectionMockState() }),
  },
  {
    method: 'PUT',
    pattern: '/security/similar-detection',
    handler: (req) => ({
      status: 200,
      data: putSimilarDetectionMockState((req.body ?? {}) as Record<string, unknown>),
    }),
  },

  // ─── 处置设置（email-disposal/disposal-settings，mock）────────────────
  {
    method: 'GET',
    pattern: '/disposal-settings',
    handler: () => ({ status: 200, data: mockDisposalSettingsGet() }),
  },
  {
    method: 'PUT',
    pattern: '/disposal-settings',
    handler: (req) => ({
      status: 200,
      data: mockDisposalSettingsPut(req.body as DisposalSettings),
    }),
  },
  // 组织通讯录部门聚合（供处置设置「通知范围」的部门树使用）。
  {
    method: 'GET',
    pattern: '/contacts/_departments',
    handler: () => ({ status: 200, data: mockContactDepartmentsList() }),
  },
  // ==================== 组织通讯录（admin-contacts html_spec）====================
  {
    method: 'GET',
    pattern: '/contact-sources',
    handler: (req) => {
      const q = new URLSearchParams(rawQuery(req.path));
      return {
        status: 200,
        data: mockContactSourcesList({
          search: q.get('search') || undefined,
          source_type: q.get('source_type') || undefined,
          sync_status: q.get('sync_status') || undefined,
          auto_sync: q.get('auto_sync') || undefined,
          page: q.get('page') ? Number(q.get('page')) : undefined,
          page_size: q.get('page_size') ? Number(q.get('page_size')) : undefined,
        }),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/contact-sources',
    handler: (req) => ({ status: 201, data: mockContactSourceCreate((req.body ?? {}) as Record<string, unknown>) }),
  },
  {
    method: 'PUT',
    pattern: /^\/contact-sources\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const row = mockContactSourceUpdate(id, (req.body ?? {}) as Record<string, unknown>);
      return row ? { status: 200, data: row } : { status: 404, data: { error: { code: 'not_found', message: 'contact source not found' } } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/contact-sources\/\d+$/,
    handler: (req) => {
      mockContactSourceDelete(Number(pathname(req.path).split('/')[2]));
      return { status: 204, data: {} };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/contact-sources\/\d+\/auto-sync$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const row = mockContactSourceSetAutoSync(id, (req.body ?? {}) as { enabled?: boolean; cron_expr?: string });
      return row ? { status: 200, data: row } : { status: 404, data: { error: { code: 'not_found', message: 'contact source not found' } } };
    },
  },
  {
    method: 'POST',
    pattern: '/contact-sources/_test',
    handler: () => ({ status: 200, data: mockContactSourceTest() }),
  },
  {
    method: 'POST',
    pattern: /^\/contact-sources\/\d+\/test$/,
    handler: () => ({ status: 200, data: mockContactSourceTest() }),
  },
  {
    method: 'POST',
    pattern: /^\/contact-sources\/\d+\/sync$/,
    handler: (req) => ({ status: 200, data: mockContactSourceSync(Number(pathname(req.path).split('/')[2])) }),
  },
  {
    method: 'GET',
    pattern: '/contacts',
    handler: (req) => {
      const q = new URLSearchParams(rawQuery(req.path));
      return {
        status: 200,
        data: mockContactsList({
          keyword: q.get('keyword') || undefined,
          source_id: q.get('source_id') || undefined,
          tag: q.get('tag') || undefined,
          page: q.get('page') ? Number(q.get('page')) : undefined,
          page_size: q.get('page_size') ? Number(q.get('page_size')) : undefined,
        }),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/contacts/bulk',
    handler: (req) => ({ status: 200, data: mockContactsBulk((req.body ?? {}) as { action?: string; tag?: string; ids?: number[] }) }),
  },
  {
    method: 'GET',
    pattern: '/contact-sync-logs',
    handler: (req) => {
      const q = new URLSearchParams(rawQuery(req.path));
      return {
        status: 200,
        data: mockContactSyncLogsList({
          sync_type: q.get('sync_type') || undefined,
          status: q.get('status') || undefined,
          source_id: q.get('source_id') || undefined,
          page: q.get('page') ? Number(q.get('page')) : undefined,
          page_size: q.get('page_size') ? Number(q.get('page_size')) : undefined,
        }),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/contact-sync-logs\/\d+$/,
    handler: (req) => {
      const detail = mockContactSyncLogDetail(Number(pathname(req.path).split('/')[2]));
      return detail
        ? { status: 200, data: detail }
        : { status: 404, data: { error: { code: 'not_found', message: 'sync log not found' } } };
    },
  },
  // 召回策略触发源密钥（webapp 扩展卡片，非 demo 原型能力）。
  {
    method: 'GET',
    pattern: '/recall-keys',
    handler: () => ({ status: 200, data: mockRecallKeysList() }),
  },
  {
    method: 'POST',
    pattern: '/recall-keys',
    handler: (req) => ({
      status: 201,
      data: mockRecallKeyCreate((req.body ?? {}) as Record<string, unknown>),
    }),
  },
  {
    method: 'DELETE',
    pattern: /^\/recall-keys\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      mockRecallKeyDelete(id);
      return { status: 204, data: {} };
    },
  },

  // ─── 链接保��日志（/logs/link-clicks，html_spec logs-link-logs）───────────
  {
    method: 'GET',
    pattern: '/link-click-logs',
    handler: (req) => ({
      status: 200,
      data: mockLinkClickLogsList(rawQuery(req.path), req.headers),
    }),
  },
  {
    method: 'GET',
    pattern: /^\/link-click-logs\/(\d+)\/download$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const row = mockLinkClickLogById(id);
      return row ? { status: 200, data: row } : { status: 404, data: { error: 'not found' } };
    },
  },
  // ─── 认证日志（logs-auth-logs）────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/auth-attempts',
    handler: (req) => {
      const params: Record<string, string> = {};
      const qs = req.path.split('?')[1];
      if (qs) {
        for (const part of qs.split('&')) {
          const [k, v] = part.split('=');
          if (k) params[k] = decodeURIComponent(v || '');
        }
      }
      return {
        status: 200,
        data: mockAuthAttemptsList({
          page: params.page ? Number(params.page) : undefined,
          page_size: params.page_size ? Number(params.page_size) : undefined,
          keyword: params.keyword,
          username: params.username,
          client_ip: params.client_ip,
          success: params.success === 'true' ? true : params.success === 'false' ? false : undefined,
          auth_protocol: params.auth_protocol,
          scene: params.scene,
          domain: params.domain,
          fail_reason: params.fail_reason,
        }),
      };
    },
  },
  {
    method: 'GET',
    pattern: '/auth-attempts/stats',
    handler: () => ({ status: 200, data: mockAuthAttemptStatsData() }),
  },

  // ─── 系统状态仪表盘：举报待审 / 智能体 stats / 系统健康 ─────────────────────
  // 举报待审待处理��（KPI，range-less → 按 currentSystemStatusRange 分支：2/6/13）。
  {
    method: 'GET',
    pattern: '/inbound-audit',
    handler: () => ({ status: 200, data: mockInboundAuditPending() }),
  },
  // 智能体运行概况 / 待办：钓鱼、仿冒、威胁回溯 stats。
  {
    method: 'GET',
    pattern: '/phishing-agent/stats',
    handler: () => ({ status: 200, data: mockPhishingStats() }),
  },
  {
    method: 'GET',
    pattern: '/spoofing-agent/stats',
    handler: () => ({ status: 200, data: mockSpoofingStats() }),
  },
  {
    method: 'GET',
    pattern: '/threat-retro-agent/stats',
    handler: () => ({ status: 200, data: mockThreatRetroStats() }),
  },
  // 系统与服务健康卡片（新端点，demo SYSTEM_HEALTH 形状）。
  {
    method: 'GET',
    pattern: '/system/health-summary',
    handler: () => ({ status: 200, data: mockSystemHealthSummary() }),
  },

  // ─── 邮件路由 html_spec 对齐（design/implement/spec/2026-07-28-mail-routing-
  // html-spec-alignment-design.md，实施 task-2-brief.md）────────────────────
  // 收信域/转发放行/出站规则/发信认证都有真实后端路径，这里做同路径 mock；
  // 代理 IP / 投递通道没有真实后端，属于 mock-only 的虚拟 endpoint
  // （`/mail-routing/outbound-*`）。fixture 与 CRUD 状态见 mail-routing-fixtures.ts。
  {
    method: 'GET',
    pattern: '/routing/_meta/scope',
    handler: () => ({ status: 200, data: mockRoutingScope() }),
  },
  {
    method: 'GET',
    pattern: /^\/tenants\/\d+\/domains$/,
    // 该共享路由由 mail-routing fixture 承接（原 DKIM 租户域名 mock 并入，见
    // mail-routing-fixtures）；租户表单在 Mock 模式下显示 mail-routing 域名数据。
    handler: (req) => {
      const tenantId = Number(pathname(req.path).split('/')[2]);
      return { status: 200, data: mockTenantDomainsList(tenantId) };
    },
  },

  // ─── DKIM 外发签名（域名下拉，认证协议检查 → DKIM 外发签名子卡）───────────
  {
    method: 'GET',
    pattern: '/dkim/signing-domains',
    handler: (req) => {
      const query = new URLSearchParams(req.path.split('?')[1] ?? '');
      const rawTenantId = query.get('tenant_id');
      const tenantId = Number(rawTenantId);
      if (!rawTenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
        return {
          status: 400,
          data: {
            error: {
              code: 'invalid_request',
              message: 'tenant_id query param must be a positive integer',
            },
          },
        };
      }
      return {
        status: 200,
        data: mockDkimSigningDomainsFor(tenantId),
      };
    },
  },

  // ─── DKIM 外发签名密钥（认证协议检查 → DKIM 外发签名子卡）──────────────────
  // 生成/导入/校验/激活/删除全套，内存态可变（mock/dkim.ts），支持完整 demo 流。
  // 注意路由顺序：generate/import 为非数字子路径，放在 /^\/dkim\/keys\/\d+/ 正则
  // 之前，避免被数字 id 正则误伤（两者其实不冲突，仍显式前置以求稳）。
  {
    method: 'GET',
    pattern: '/dkim/keys',
    handler: (req) => ({ status: 200, data: mockListDkimKeys(req.path) }),
  },
  {
    method: 'POST',
    pattern: '/dkim/keys/generate',
    handler: (req) => {
      const b = (req.body ?? {}) as {
        tenant_id: number;
        domain: string;
        selector: string;
        algorithm: DkimAlgorithm;
        key_size?: number;
        note?: string;
      };
      return { status: 201, data: mockGenerateDkimKey(b) };
    },
  },
  {
    method: 'POST',
    pattern: '/dkim/keys/import',
    handler: (req) => {
      const b = (req.body ?? {}) as {
        tenant_id: number;
        domain: string;
        selector: string;
        note?: string;
      };
      return { status: 201, data: mockImportDkimKey(b) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/dkim\/keys\/\d+\/verify-dns$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      return { status: 200, data: mockVerifyDkimDns(id) };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/dkim\/keys\/\d+\/status$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      const b = (req.body ?? {}) as { is_active?: boolean };
      mockSetDkimKeyStatus(id, b.is_active ?? false);
      return { status: 204, data: {} };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/dkim\/keys\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[3]);
      mockDeleteDkimKey(id);
      return { status: 204, data: {} };
    },
  },

  // ─── 邮件路由 - 收信域：新建域名 / nexthop CRUD / 探测（html_spec inbound-domains）──
  {
    method: 'POST',
    pattern: /^\/tenants\/\d+\/domains$/,
    handler: (req) => {
      const tenantId = Number(pathname(req.path).split('/')[2]);
      return { status: 201, data: mockCreateTenantDomain(tenantId, req.body) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/tenants\/\d+\/domains\/\d+\/nexthops$/,
    handler: (req) => {
      const domainId = Number(pathname(req.path).split('/')[4]);
      return { status: 200, data: mockNexthopsList(domainId) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/tenants\/\d+\/domains\/\d+\/nexthops$/,
    handler: (req) => {
      const domainId = Number(pathname(req.path).split('/')[4]);
      return { status: 201, data: mockCreateNexthop(domainId, req.body) };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/tenants\/\d+\/domains\/\d+\/nexthops\/\d+$/,
    handler: (req) => {
      const nexthopId = Number(pathname(req.path).split('/')[6]);
      const nh = mockUpdateNexthop(nexthopId, req.body);
      return nh ? { status: 200, data: nh } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/tenants\/\d+\/domains\/\d+\/nexthops\/\d+$/,
    handler: (req) => {
      const nexthopId = Number(pathname(req.path).split('/')[6]);
      return mockDeleteNexthop(nexthopId)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'POST',
    pattern: /^\/tenants\/\d+\/domains\/\d+\/probe$/,
    handler: (req) => {
      const domainId = Number(pathname(req.path).split('/')[4]);
      const result = mockProbeDomain(domainId);
      return result ? { status: 200, data: result } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'PUT',
    pattern: /^\/tenant-domains\/\d+$/,
    handler: (req) => {
      const domainId = Number(pathname(req.path).split('/')[2]);
      const d = mockUpdateTenantDomain(domainId, req.body);
      return d ? { status: 200, data: d } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/tenant-domains\/\d+$/,
    handler: (req) => {
      const domainId = Number(pathname(req.path).split('/')[2]);
      return mockDeleteTenantDomain(domainId)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  // 转发设置 / 未认证放行（mail-admission-rules，取代旧 relay-grants，Task 13）。
  {
    method: 'GET',
    pattern: '/mail-admission-rules',
    handler: () => ({ status: 200, data: mockMailAdmissionRulesList() }),
  },
  {
    method: 'POST',
    pattern: '/mail-admission-rules',
    handler: (req) => ({ status: 201, data: mockCreateMailAdmissionRule(req.body) }),
  },
  {
    method: 'GET',
    pattern: '/mail-admission/_meta/policy',
    handler: () => ({ status: 200, data: mockMailAdmissionPolicy() }),
  },
  {
    method: 'PUT',
    pattern: '/mail-admission/_meta/policy',
    handler: (req) => ({ status: 200, data: mockSetMailAdmissionPolicy(req.body) }),
  },
  {
    method: 'PUT',
    pattern: /^\/mail-admission-rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const r = mockUpdateMailAdmissionRule(id, req.body);
      return r ? { status: 200, data: r } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/mail-admission-rules\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteMailAdmissionRule(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  // 出站路由 - 路由规则：真实模式走 unified-rules（page=mail_routing_outbound）。
  // 列表可靠 query 收窄；写操作（PUT/PUT status/DELETE）的真实调用方走
  // src/lib/api/unified-rules.ts 的通用函数，不带 scope query，只能靠 mock id
  // 段（5000-5999，呼应群组策略 90xx 的既有惯例）收窄，避免吞掉其它模块对
  // /unified-rules/{id} 的无 scope 写操作（回归见 group-policy-mock.test.ts）。
  {
    method: 'GET',
    pattern: '/unified-rules',
    // task-2-brief 与设计文档字面要求的 query 键是 `page=mail_routing_outbound`；
    // 但当前 OutboundRoutingTab.tsx（后续任务会重写）实际复用
    // src/lib/api/unified-rules.ts 的通用 getUnifiedRules()，那个函数把
    // `page` 参数编码成 `rule_page=`，不是 `page=`。两种键都收，兼容重写前后
    // 两种可能的调用方式，不收窄就不匹配、不影响其它模块。
    matchQuery: (q) => {
      const params = new URLSearchParams(q);
      return params.get('page') === 'mail_routing_outbound' || params.get('rule_page') === 'mail_routing_outbound';
    },
    handler: () => ({ status: 200, data: mockOutboundRulesUnifiedList() }),
  },
  {
    method: 'PUT',
    pattern: MR_OUTBOUND_RULE_ID_PATTERN,
    handler: (req) => {
      const p = pathname(req.path);
      const id = Number(p.split('/')[2]);
      const rule = p.endsWith('/status')
        ? mockSetOutboundRuleStatus(id, Boolean((req.body as { is_active?: boolean } | undefined)?.is_active))
        : mockUpdateOutboundRule(id, req.body);
      return rule ? { status: 200, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  // demo 语义里状态开关也常见 POST（内容规则/群组策略等用 PUT，这里额外兼容
  // POST /status，见 task-2-brief 写操作方法列 "POST/PUT/DELETE"）。
  {
    method: 'POST',
    pattern: /^\/unified-rules\/(5\d{3})\/status$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const rule = mockSetOutboundRuleStatus(id, Boolean((req.body as { is_active?: boolean } | undefined)?.is_active));
      return rule ? { status: 200, data: rule } : { status: 404, data: { message: 'not found' } };
    },
  },
  // 路由规则抽屉的通道下拉：列出 active 的 proxysvr 组（真实端点形状，Task 13）。
  {
    method: 'GET',
    pattern: '/proxysvr-groups/_meta/active',
    handler: () => ({ status: 200, data: mockActiveProxysvrGroups() }),
  },
  // 发信认证（mail-auth-configs，真实后端已支撑）。
  {
    method: 'GET',
    pattern: '/mail-auth-configs',
    handler: () => ({ status: 200, data: mockMailAuthConfigsList() }),
  },
  {
    method: 'POST',
    pattern: '/mail-auth-configs',
    handler: (req) => ({ status: 201, data: mockCreateMailAuthConfig(req.body) }),
  },
  {
    method: 'PUT',
    pattern: /^\/mail-auth-configs\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const c = mockUpdateMailAuthConfig(id, req.body);
      return c ? { status: 200, data: c } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/mail-auth-configs\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteMailAuthConfig(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'POST',
    pattern: '/mail-auth-configs/test',
    handler: () => ({ status: 200, data: mockMailAuthTest() }),
  },
  // 出站路由 - 代理 IP（proxysvr-endpoints，真实后端，Task 13 取代虚拟 endpoint）。
  {
    method: 'GET',
    pattern: '/proxysvr-endpoints',
    handler: () => ({ status: 200, data: mockProxysvrEndpointsList() }),
  },
  {
    method: 'POST',
    pattern: '/proxysvr-endpoints',
    handler: (req) => ({ status: 201, data: mockCreateProxysvrEndpoint(req.body) }),
  },
  {
    method: 'PUT',
    pattern: /^\/proxysvr-endpoints\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const p = mockUpdateProxysvrEndpoint(id, req.body);
      return p ? { status: 200, data: p } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/proxysvr-endpoints\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      return mockDeleteProxysvrEndpoint(id)
        ? { status: 200, data: { status: 'deleted' } }
        : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'POST',
    pattern: /^\/proxysvr-endpoints\/\d+\/probe$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const result = mockProbeProxysvrEndpoint(id);
      return result ? { status: 200, data: result } : { status: 404, data: { message: 'not found' } };
    },
  },
  // 出站路由 - 投递通道（proxysvr-groups，真实后端，Task 13 取代虚拟 endpoint）。
  {
    method: 'GET',
    pattern: '/proxysvr-groups',
    handler: () => ({ status: 200, data: mockProxysvrGroupsList() }),
  },
  {
    method: 'POST',
    pattern: '/proxysvr-groups',
    handler: (req) => ({ status: 201, data: mockCreateProxysvrGroup(req.body) }),
  },
  {
    method: 'PUT',
    pattern: /^\/proxysvr-groups\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const c = mockUpdateProxysvrGroup(id, req.body);
      return c ? { status: 200, data: c } : { status: 404, data: { message: 'not found' } };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/proxysvr-groups\/\d+$/,
    handler: (req) => {
      const id = Number(pathname(req.path).split('/')[2]);
      const result = mockDeleteProxysvrGroup(id);
      if (!result.ok) {
        return {
          status: 409,
          data: {
            error: {
              code: 'conflict',
              message:
                'proxysvr group is referenced by one or more outbound route rules and cannot be deleted; remove those rules first',
            },
          },
        };
      }
      return { status: 200, data: { status: 'deleted' } };
    },
  },
  // 收信域抽屉「测试连通性」按钮专用的 mock-only 虚拟 endpoint（receiving-tab.tsx，任意
  // host/port 组合的一次性连通性测试��真实后端没有对应 API）；出站代理/通道已改用真实 TCP/TLS
  // 探测（POST /proxysvr-endpoints/:id/probe），不再复用这个端点。
  {
    method: 'POST',
    pattern: '/mail-routing/connectivity-test',
    handler: () => ({ status: 200, data: mockConnectivityTest() }),
  },
];

// 判断当前 (method, path) 是否已被 mock 路由覆盖。
// client.ts 用它决定是走 mock 还是放行到真实后端 —— 这样 dev 环境既
// 能用 mock 补全缺失接口，也能继续打真实后端拿已有接口。
export function isMockable(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const p = pathname(path);
  const q = rawQuery(path);
  return routes.some(
    (r) => matchMethod(r.method, m) && matchPath(r.pattern, p) && (!r.matchQuery || r.matchQuery(q)),
  );
}

function matchMethod(routeMethod: string | RegExp, m: string): boolean {
  if (routeMethod instanceof RegExp) return routeMethod.test(m);
  if (routeMethod.includes('|')) return routeMethod.split('|').includes(m);
  return routeMethod === m;
}

function matchPath(pattern: string | RegExp, p: string): boolean {
  if (pattern instanceof RegExp) return pattern.test(p);
  return pattern === p;
}

// 主分发：返回 MockResponse；找不到匹配时返回空壳 200，避免页面整体崩溃。
// 写操作（POST/PUT/DELETE/PATCH）默认返回 204 空体；GET 返回 { items: [] }
// 或 {}，调用方都能容错地"展示空列表/空对象"。
export function dispatch(req: MockRequest): MockResponse {
  const m = req.method.toUpperCase();
  const p = pathname(req.path);
  const q = rawQuery(req.path);

  for (const r of routes) {
    if (matchMethod(r.method, m) && matchPath(r.pattern, p) && (!r.matchQuery || r.matchQuery(q))) {
      return r.handler(req);
    }
  }

  // Fallback：未覆盖接口返回友好的空壳。
  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(m);
  if (isWrite) return { status: 204, data: {} };
  // list 类接口（以 s 结尾或含 search）给 { items: [], total: 0 }，避免
  // 分页组件因缺字段崩；其它给 {}。
  if (p.endsWith('s') || p.includes('search')) {
    return { status: 200, data: { items: [], total: 0, page: 1, page_size: 20 } };
  }
  return { status: 200, data: {} };
}
