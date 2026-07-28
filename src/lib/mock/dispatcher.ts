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
} from './fixtures';
import type { IPFrequencyRulePayload } from '@/types/ip-frequency';
import type { OverseasMailConfigResponse } from '@/types/overseas-mail';
import type { DisposalSettings } from '@/types/disposal-settings';
import { GROUPS_PAGE_KEY } from '@/types/groups';
import { GROUP_POLICY_PAGE_KEY } from '@/types/group-policy';
import type { OpsDimension, OpsTopCount } from '@/lib/api/ops-top';

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

// 用并表替代大 switch，便于扩展。按注册顺序遍历，第一个匹配即返回。
const routes: Route[] = [
  // 认证接口（/auth/**）刻意不 mock：登录必须走真实后端，确保拿到有效的
  // HttpOnly osgateway_token cookie，后续受保护路由的 middleware 校验才能通过。
  // 见 src/proxy.ts 的 AUTH_COOKIE 门控。

  // ─── Bootstrap ──────────────────────────────────────────────────────────
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
          ? (params.product_action as 'block' | 'quarantine' | 'mark')
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

  // ─── 管理员操作日志（mock）──────────────────────────────────────────────────
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

  // ─── 链接保护日志（/logs/link-clicks，html_spec logs-link-logs）───────────
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
  // 举报待审待处理数（KPI，range-less → 按 currentSystemStatusRange 分支：2/6/13）。
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
