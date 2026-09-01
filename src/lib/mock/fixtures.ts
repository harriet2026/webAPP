// Mock fixture 数据。仅包含让前端能跑通主流程的最小数据集：
//   - bootstrap（产品形态能力）
//   - 租户列表
//   - dashboard/统计
//   - 监控节点
// 认证接口（/auth/**）不 mock：登录必须走真实后端拿 HttpOnly token cookie。
// 任何未覆盖的接口，dispatcher 会返回一个友好的空壳（见 dispatcher.ts），
// 而不是 404，这样页面不会因为单个接口缺失就整页崩掉。

import type { Bootstrap } from "@/lib/api/bootstrap";
import canonicalRegistry from "@/lib/product-form/__fixtures__/registry_for_test.json";
import type { FeatureDef } from "@/lib/product-form/resolve";
import type { LinkClickLog } from "@/lib/api/link-clicks";
import type { AuthAttempt, AuthAttemptStats } from "@/lib/api/auth-attempts";
import type { AdminAuditLog } from "@/lib/api/admin-audit";
import type { DeliveryTrafficResponse, DetailTableRow, Direction } from "@/lib/api/delivery-traffic";
import type {
  LinkAttachmentStats,
  TopMaliciousAttachment,
  TopMaliciousDomain,
} from "@/lib/api/link-attachment-security";
import type { TenantListResponse, TenantStats } from "@/types/tenant";
import type { AgentCenterOverview } from "@/types/agent-center";
import type {
  IPFrequencyRuleView,
  IPFrequencyRulePayload,
  IPFrequencyTestResponse,
  SuspendedIP,
} from "@/types/ip-frequency";
import type { IPFilterRuleView, IPGroupMeta } from "@/types/ip-filter";
import type {
  RBLFilterRuleView,
  RBLFilterMatchMode,
  RBLFilterProductAction,
  RBLFilterLegacyProductAction,
} from "@/types/rbl-filter";
import type { DetectionProfile } from "@/lib/api/detection-profiles";
import { mapPhishingDispositionToDisplayStatus } from "@/lib/display-status";
import type {
  OverseasMailConfigResponse,
  OverseasMailDirConfig,
  GeoIpRule,
  GeoIpRuleListResponse,
} from "@/types/overseas-mail";
import type { Rule, RuleNode } from "@/types/unified-rules";
import type { SenderFilterSenderConfig } from "@/types/sender-filter";
import { buildConditionTree } from "@/lib/api/sender-filter";
import { serializeMembers } from "@/lib/api/groups";
import {
  GROUP_TAG_PREFIX,
  GROUP_TYPE_TO_STAGE,
  type GroupType,
} from "@/types/groups";
import type {
  AuthSpoofingConfig,
  ObserveStatPoint,
  ProbeResponse,
} from "@/types/auth-spoofing";
import type {
  BehaviorControlMetadata,
  BehaviorControlObjectConfig,
  BehaviorDirection,
  BehaviorObjectType,
  BehaviorSenderSubType,
  BehaviorIPSubType,
  BehaviorTimeWindow,
  BehaviorDimension,
  BehaviorProductAction,
  RecipientLimitConfig,
  RecipientCheckConfig,
} from "@/types/behavior-control";
import { PRODUCT_TO_BACKEND } from "@/types/behavior-control";
import type { IntentType } from "@/types/intent-engine";
import {
  INTENT_TYPES,
  RISK_LEVEL_OF,
  DEFAULT_MARK_TEXT,
  createDefaultMarkConfig,
} from "@/types/intent-engine";
import type { SimilarDetectionConfig } from "@/components/security/similar-detection/types";
import { defaultConfig as defaultSimilarDetectionConfig } from "@/components/security/similar-detection/defaults";
import type {
  DisposalSettings,
  CategoryNotifyEntry,
} from "@/types/disposal-settings";
import type {
  DashboardSummaryResponse,
  TypeStatisticsResponse,
  EmailType,
} from "@/lib/api/statistics";
import { EMAIL_TYPES } from "@/lib/api/statistics";
import type {
  SecurityOverviewResponse,
  TrendSeriesPoint,
  GeoDistributionResponse,
  TimeDistributionResponse,
  DrillDownResponse,
  EscapeListResponse,
  DrillDimension,
} from "@/lib/api/security-overview";
import type {
  OpsDimension,
  OpsDrilldownResponse,
  OpsTopCount,
  OpsTopResponse,
  OpsTopRow,
} from "@/lib/api/ops-top";
import type {
  NodesResp,
  HardwareResp,
  ProcessesResp,
  DockerContainersResp,
  DatabaseResp,
  StorageResp,
  BackupResp,
  RuntimeResp,
  ServiceTrendResp,
  MailflowQueueResp,
  MailflowDeliveryResp,
  MailflowBounceResp,
  MailflowConnectionResp,
  MailflowConnTrendResp,
  MailflowConnFailureResp,
  MailflowDirection,
  SecurityEngine,
  SecurityTimeRange,
  SecurityEngineResp,
} from "@/types/monitoring";
import type {
  AlertListResp,
  AlertEvent,
  AlertRule,
  AlertRulePayload,
  AlertStats,
  MetricDef,
  AlertTemplate,
  SmtpConfig,
  SmtpConfigPayload,
} from "@/types/alerts";
import type { InboundAuditListResponse } from "@/lib/api/inbound-audit";
import type {
  PhishingStats,
  DetectionLogItem,
  DetectionLogDetail,
  DetectionLogListResponse,
  RecipientDisposition,
  InvestigationTask,
  Disposition,
  BlockResponse,
  ExemptResponse,
} from "@/types/phishing-detection";
import type { SpoofingStats } from "@/types/spoofing-detection";
import type { ThreatRetroStats } from "@/types/threat-retro";
import type { MonitorDashboardOverview, MonitorDashboardRange } from "@/lib/api/monitor-dashboard";

// ════════════════════════════════════════════════════════════════════════════════
// 邮件标记与声明（mail_marking，mock）
// 数据逐项来自 demo `mail-marking-module.tsx`。webapp 遵循项目级优先级语义，
// 因此列表层会按 priority DESC 显示，而不是沿用 demo 的升序排序。
// ════════════════════════════════════════════════════════════════════════════════

const MAIL_MARKING_DEPARTMENTS = [
  ["dept-1", "高管部"],
  ["dept-2", "财务部"],
  ["dept-3", "销售部"],
  ["dept-4", "研发部"],
  ["dept-5", "人力资源部"],
  ["dept-6", "法务部"],
] as const;

const MAIL_MARKING_GROUPS = [
  ["grp-1", "全体员工"],
  ["grp-2", "外包人员"],
  ["grp-3", "全体管理层"],
  ["grp-4", "海外办事处"],
] as const;

function mailMarkingCondition(
  direction: "receive" | "send",
  scopes: string[],
): RuleNode {
  const dir: RuleNode = {
    type: "condition",
    field: "is_outbound",
    operator: "eq",
    value: direction === "send" ? "true" : "false",
  };
  if (scopes.length === 0) return dir;
  const field = direction === "receive" ? "recipient_group" : "sender_group";
  const leaves: RuleNode[] = scopes.map((key) => ({
    type: "condition",
    field,
    map_key: `grp:${key}`,
    operator: "eq",
    value: "true",
  }));
  return {
    type: "AND",
    children: [
      dir,
      leaves.length === 1 ? leaves[0] : { type: "OR", children: leaves },
    ],
  };
}

function mailMarkingRule(o: {
  id: number;
  name: string;
  direction: "receive" | "send";
  priority: number;
  active: boolean;
  departments?: string[];
  groups?: string[];
  mark?: Record<string, unknown>;
  disclaimer?: Record<string, unknown>;
  date: string;
}): Rule {
  const departments = o.departments ?? [];
  const groups = o.groups ?? [];
  return {
    id: o.id,
    name: o.name,
    description: "",
    rule_class: "action",
    stage: "data",
    priority: o.priority,
    condition_tree: JSON.stringify(
      mailMarkingCondition(o.direction, [...departments, ...groups]),
    ),
    action: "accept",
    page: "mail_marking",
    is_active: o.active,
    tags: [],
    metadata: JSON.stringify({
      feature: "mail_marking",
      direction: o.direction,
      departments,
      groups,
      ...(o.mark ? { mark: o.mark } : {}),
      ...(o.disclaimer ? { disclaimer: o.disclaimer } : {}),
    }),
    created_at: `${o.date}T00:00:00Z`,
    updated_at: `${o.date}T00:00:00Z`,
  };
}

let mockMailMarkingRules: Rule[] = [
  mailMarkingRule({
    id: 5101,
    name: "高管外站警示",
    direction: "receive",
    priority: 1,
    active: true,
    departments: ["dept-1"],
    date: "2024-03-01",
    mark: {
      text: "【外站邮件】请谨慎处理",
      positions: ["body_top"],
      style: "orange_warning",
    },
  }),
  mailMarkingRule({
    id: 5102,
    name: "财务专用提示",
    direction: "receive",
    priority: 2,
    active: true,
    departments: ["dept-2"],
    date: "2024-03-02",
    mark: {
      text: "【外站】",
      positions: ["subject_prefix"],
      style: "plain_text",
    },
  }),
  mailMarkingRule({
    id: 5103,
    name: "默认外站提示",
    direction: "receive",
    priority: 3,
    active: true,
    date: "2024-03-03",
    mark: {
      text: "【外站邮件】",
      positions: ["subject_prefix"],
      style: "blue_tag",
    },
  }),
  mailMarkingRule({
    id: 5104,
    name: "研发静默标记",
    direction: "receive",
    priority: 4,
    active: false,
    departments: ["dept-4"],
    date: "2024-03-04",
    mark: {
      text: "X-External-Source: true",
      positions: ["header"],
      style: "plain_text",
      header_name: "X-External-Source",
    },
  }),
  mailMarkingRule({
    id: 5105,
    name: "销售部免责声明",
    direction: "send",
    priority: 1,
    active: true,
    departments: ["dept-3"],
    date: "2024-03-05",
    disclaimer: {
      content:
        "本邮件及其附件仅供收件人使用，包含的信息可能是机密的。如果您不是预期的收件人，请立即删除本邮件并通知发件人。",
      positions: ["body_bottom"],
      format: "auto",
    },
  }),
  mailMarkingRule({
    id: 5106,
    name: "法务部专用声明",
    direction: "send",
    priority: 2,
    active: true,
    departments: ["dept-6"],
    date: "2024-03-06",
    disclaimer: {
      content:
        "重要法律声明：本邮件内容受法律保护，未经授权禁止复制、转发或披露。如有法律问题请联系法务部。",
      positions: ["body_bottom"],
      format: "auto",
    },
  }),
];

export function mockMailMarkingRulesList(): { items: Rule[]; total: number } {
  return {
    items: [...mockMailMarkingRules],
    total: mockMailMarkingRules.length,
  };
}

export function mockMailMarkingGroupsList(): { items: Rule[] } {
  let id = 5200;
  const make = (
    direction: "recipient" | "sender",
    kind: "department" | "group",
    [key, name]: readonly [string, string],
  ): Rule => ({
    id: ++id,
    name,
    rule_class: "tag",
    stage: direction === "recipient" ? "rcpt" : "mail",
    priority: 100,
    condition_tree: "{}",
    is_active: true,
    tags: [`grp:${key}`],
    metadata: JSON.stringify({
      group_type: direction,
      mail_marking_scope: kind,
      member_count: 12,
    }),
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  });
  return {
    items: (["recipient", "sender"] as const).flatMap((direction) => [
      ...MAIL_MARKING_DEPARTMENTS.map((item) =>
        make(direction, "department", item),
      ),
      ...MAIL_MARKING_GROUPS.map((item) => make(direction, "group", item)),
    ]),
  };
}

export function mockCreateMailMarkingRule(body: unknown): Rule {
  const raw = (body ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const rule: Rule = {
    id: Math.max(...mockMailMarkingRules.map((item) => item.id), 5100) + 1,
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    rule_class: "action",
    stage: "data",
    priority: Number(raw.priority ?? 1),
    condition_tree: JSON.stringify(raw.condition_tree ?? {}),
    action: "accept",
    page: "mail_marking",
    is_active: raw.is_active !== false,
    tags: [],
    metadata: JSON.stringify(raw.metadata ?? {}),
    created_at: now,
    updated_at: now,
  };
  mockMailMarkingRules = [...mockMailMarkingRules, rule];
  return rule;
}

export function mockUpdateMailMarkingRule(
  id: number,
  body: unknown,
): Rule | null {
  const index = mockMailMarkingRules.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const raw = (body ?? {}) as Record<string, unknown>;
  const next: Rule = {
    ...mockMailMarkingRules[index],
    name: String(raw.name ?? mockMailMarkingRules[index].name),
    description: String(
      raw.description ?? mockMailMarkingRules[index].description ?? "",
    ),
    priority: Number(raw.priority ?? mockMailMarkingRules[index].priority),
    condition_tree: JSON.stringify(
      raw.condition_tree ??
        JSON.parse(mockMailMarkingRules[index].condition_tree),
    ),
    is_active:
      typeof raw.is_active === "boolean"
        ? raw.is_active
        : mockMailMarkingRules[index].is_active,
    metadata: JSON.stringify(
      raw.metadata ?? JSON.parse(mockMailMarkingRules[index].metadata ?? "{}"),
    ),
    updated_at: new Date().toISOString(),
  };
  mockMailMarkingRules = mockMailMarkingRules.map((item, i) =>
    i === index ? next : item,
  );
  return next;
}

export function mockDeleteMailMarkingRule(id: number): boolean {
  const before = mockMailMarkingRules.length;
  mockMailMarkingRules = mockMailMarkingRules.filter((item) => item.id !== id);
  return mockMailMarkingRules.length !== before;
}

// 认证相关 fixture（login/captcha/password-policy）已移除 —— 登录必须走真实
// 后端以拿到有效的 HttpOnly osgateway_token cookie，mock 模式不拦截 /auth/**。

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export function mockBootstrap(headers?: Record<string, string>): Bootstrap {
  // 从 X-Tenant-ID 头部还原当前正在被切换/模拟的租户（对齐 fetchBootstrap()
  // 的 selectedTenantHeader() 写法），从而按该租户自己的 capability_flags
  // 派生 grants —— 否则「租户管理」里编辑保存的能力开通（如 attachment-sandbox）
  // 永远不会反映到切换到该租户后看到的模块上。
  const tenantIdHeader = headers?.['X-Tenant-ID'] ?? headers?.['x-tenant-id'];
  const tenantId = tenantIdHeader ? Number(tenantIdHeader) : null;
  const selectedTenant =
    tenantId != null ? mockTenants.items.find((t) => t.id === tenantId) : undefined;
  // 给 Mock 租户授予 AI 智能体功能（phishing/spoofing/threat-retro 均为
  // grantable）。这样切到租户视角能完整演示「智能体中心」——对应 parity_vectors
  // 里 ai-multi/tenant/granted=true → visible。平台视角不受影响（这些功能
  // platformHidden:true，多租户平台视角恒隐藏，与 grants 无关）。
  const demoAgentGrants = ['phishing-detection', 'spoofing-detection', 'threat-retro'];
  // 与选中租户自身的 capability_flags（如「能力开通」里勾选的 attachment-sandbox）
  // 取并集，既保留既有的智能体中心演示效果，又让租户管理页的编辑结果生效。
  const grants = selectedTenant
    ? Array.from(new Set([...demoAgentGrants, ...selectedTenant.capability_flags]))
    : demoAgentGrants;
  return {
    form: "ai-multi",
    capabilities: { ai: true, multiTenant: true, saas: false },
    branding: { deployment: "self-hosted" },
    user: { role: "system_admin", tenantId: null },
    // dev mock 对齐 docker-compose.yml 的 OSG_LOCAL_AUTH_ENABLED=1 默认值。
    localAuthEnabled: true,
    // 直接复用权威注册表镜像 registry_for_test.json（internal/productform.
    // Registry 的浏览器侧镜像，由 Go/TS parity 测试守护），而不是在这里手工维护
    // 一个残缺子集。
    //
    // 为什么必须这样：可见性逻辑 isItemVisibleByForm 对「注册表里找不到的 href」
    // 走「未登记=放行」兜底（`if (!feat) return true`）。旧的手工注册表只登记了
    // 3 项，strategy-pipeline / group-policy（安全策略）、threat-retro（智能体
    // 中心）等根本没登记，于是 resolve() 的 platformHidden 规则没机会执行，导致
    // 这些 tenant-only 模块在 Mock 模式的平台管理员视角下恒显示 —— 与生产
    // registry.go（platformHidden: true）及 parity_vectors.json 的判定完全不符。
    // 用完整镜像后，Mock 与离线演示会话（createOfflineDemoBootstrap）、生产三者
    // 的菜单语义完全一致，且不会再因为「漏登记某个功能」而失败开放。
    featureRegistry: canonicalRegistry as FeatureDef[],
    grants,
  };
}

// ─── 租户 ───────────────────────────────────────────────────────────────

export const mockTenantStats: TenantStats = {
  total: 3,
  active: 2,
  pending: 1,
  awaitingRouting: 1,
};

export const mockTenants: TenantListResponse = {
  items: [
    {
      id: 1,
      name: "示例租户 A",
      description: "Mock 租户，用于无后端开发",
      code: "TENANT_A",
      language: "zh",
      status: "active",
      capability_flags: ["ai"],
      routing_progress: {
        receiving: true,
        relay: true,
        outbound: true,
        auth: true,
      },
      expired: false,
      access_status: "configured",
      domain_count: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    {
      id: 2,
      name: "示例租户 B",
      description: "Mock 租户",
      code: "TENANT_B",
      language: "en",
      status: "active",
      capability_flags: [],
      routing_progress: {
        receiving: true,
        relay: false,
        outbound: false,
        auth: true,
      },
      expired: false,
      access_status: "configured",
      domain_count: 1,
      created_at: "2026-02-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    {
      id: 3,
      name: "待配置租户 C",
      description: "pending 状态",
      code: "TENANT_C",
      language: "zh",
      status: "pending",
      capability_flags: [],
      routing_progress: {
        receiving: false,
        relay: false,
        outbound: false,
        auth: false,
      },
      expired: false,
      access_status: "pending",
      domain_count: 0,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
  ],
  total: 3,
  page: 1,
  page_size: 20,
};

// ─── Dashboard / 统计 ────────────────────────────────────────────────────────

export const mockDashboardSummary = {
  metrics: {
    total_emails: 12345,
    // 字段名必须与 DashboardMetrics (statistics.ts) 对齐：后端用的是 *_emails
    // 后缀，前端 stats-cards.tsx 读 metrics.accepted_emails 等。少了 _emails
    // 后缀会导致卡片显示 0（字段 undefined）。
    accepted_emails: 11000,
    rejected_emails: 987,
    quarantined_emails: 234,
    sidelined_emails: 124,
    // 11-key persisted email_type breakdown (DashboardMetrics.by_email_type),
    // not the retired 4-key normal/spam/suspicious/high_risk shape.
    by_email_type: {
      normal: 10000,
      subscription: 200,
      advertising: 150,
      spam: 800,
      harmful: 15,
      suspicious: 120,
      sensitive: 10,
      spoofing: 5,
      phishing: 34,
      virus: 8,
      account_compromised: 3,
    },
  },
  top_malicious_emails: [],
};

export const mockFilterStatistics = {
  action_counts: { accept: 11000, reject: 987, quarantine: 234, sideline: 124 },
  time_series: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    return {
      timestamp: d.toISOString().slice(0, 10),
      accept: 1000 + Math.round(Math.random() * 200),
      reject: 100 + Math.round(Math.random() * 50),
      quarantine: 30 + Math.round(Math.random() * 20),
      sidelined: 10 + Math.round(Math.random() * 10),
    };
  }),
};

// ════════════════════════════════════════════════════════════════════════════════
// 系统状态仪表盘（SystemStatusDashboard，/zh/dashboard）——demo parity。
// 逐字段照抄 design/origin/demo/.../security-ops-dashboard.tsx 的硬编码值，
// 按时间范围（today / 7d / 30d）分支。范围通过 query 的 start_date/end_date 传达：
//   today → start==end（span 0）；7d → span 6；30d → span 29。
// dispatcher 的各路由把 (start,end) 或 time_range 交给这里的 fixture 函数。
// ════════════════════════════════════════════════════════════════════════════════

export type SystemStatusRangeKey = "today" | "7d" | "30d";

// 范围-less 的探针（待处置 /mail-logs、举报待审 /inbound-audit）和「当前期 vs
// 上一期」的判定都需要跨调用的一点点模块级状态：hook 在一个 Promise.all 里按数组
// 顺序同步派发（mock 命中时 apiRequest 在首个 await 之前同步返回），所以
// dashboard/security-overview 的当前期调用先于 disposal/inbound-audit 派发，这里
// 记录到的 latestDashEnd / latestSpanDays 到 disposal 读取时已是正确值。
let latestDashEnd = "";
let latestSpanDays = 0;

function daysBetween(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.round((e - s) / 86_400_000);
}

export function spanToRange(span: number): SystemStatusRangeKey {
  if (span <= 0) return "today";
  if (span <= 6) return "7d";
  return "30d";
}

// dashboard-summary / security-overview 两个 mock 路由在每次请求时调用。
// 返回：本窗口是否为「当前期」（end_date 是本会话见过的最新 end → 恒为今天，因为
// 三个范围的当前窗口都以今天结束，而上一期窗口都早于今天），以及由 span 推出的
// 范围键。当前期同时刷新 latestSpanDays，供范围-less 探针复用。
export function noteDashboardWindow(
  startDate: string,
  endDate: string,
): { isCurrent: boolean; range: SystemStatusRangeKey } {
  const span = daysBetween(startDate, endDate);
  const range = spanToRange(span);
  const isCurrent = endDate >= latestDashEnd;
  if (isCurrent) {
    latestDashEnd = endDate;
    latestSpanDays = span;
  }
  return { isCurrent, range };
}

export function currentSystemStatusRange(): SystemStatusRangeKey {
  return spanToRange(latestSpanDays);
}

// ─── KPI：收信总量（/statistics/dashboard，total_emails）───────────────────────
// inboundDelta 由前端算 (cur-prev)/prev*100；prev 取值使 delta ≈ demo 的
// +12 / +8 / -4：prev = round(cur / (1 + delta/100))。
const DASH_TOTALS: Record<SystemStatusRangeKey, { cur: number; prev: number }> = {
  today: { cur: 128_456, prev: 114_693 }, // +12%
  "7d": { cur: 902_331, prev: 835_492 }, //  +8%
  "30d": { cur: 3_984_210, prev: 4_150_219 }, // -4%
};

export function mockDashboardSummaryFor(
  startDate: string,
  endDate: string,
): DashboardSummaryResponse {
  const { isCurrent, range } = noteDashboardWindow(startDate, endDate);
  const totals = DASH_TOTALS[range];
  const total = isCurrent ? totals.cur : totals.prev;
  // 复用既有基础 metrics 形状（accepted_emails / by_email_type 等供其它页面读），
  // 只按范围替换 total_emails。基础对象缺少 spf/dkim/dmarc/by_action/by_day 字段，
  // 但这些字段本仪表盘不读，故这里断言为响应类型即可。
  return {
    ...(mockDashboardSummary as unknown as DashboardSummaryResponse),
    metrics: {
      ...(mockDashboardSummary as unknown as DashboardSummaryResponse).metrics,
      total_emails: total,
    },
  };
}

// ─── 邮件安全总览（/statistics/security-overview/**）─────────────────────────
// 与 demo 的默认口径一致，所有数据确定性生成，保证离线演示和 E2E 可复现。
const SECURITY_KPI = {
  total_filtered: 12_450,
  total_filtered_delta: 8.2,
  block_rate: 97.2,
  block_rate_delta: 1.4,
  recall_rate: 100,
  recall_rate_delta: 0,
  pending_review: 23,
  pending_review_delta: -11.5,
  blocked: 12_101,
};

// 确定性伪值：在 [base, base+width) 内按 index �����滑取值（无 Math.random，可复现）。
function threatSeriesValue(
  i: number,
  base: number,
  width: number,
  scale: number,
): number {
  const t = (Math.sin(i * 1.7 + base * 0.37) + 1) / 2; // 0..1，确定性
  return Math.floor((base + t * width) * scale);
}

// 5 条 series 对齐 demo THREAT_SERIES：phishing / spoofing / spam / virus /
// malicious（demo「恶意链接」→ malicious）。点数：today 24（1h，00:00..23:00）、
// 7d 7 日、30d 30 日；7d/30d 数值按 demo scale（6 / 5）放大。值域对齐 demo：
// phishing 20-60、spoofing 10-40、spam 40-120、virus 3-18、malicious 8-33。
const SECURITY_DATES = ["11/1", "11/2", "11/3", "11/4", "11/5", "11/6", "11/7"];

function buildOverviewRows(
  keys: string[],
  bases: number[],
  scale = 1,
  dates: string[] = SECURITY_DATES,
): TrendSeriesPoint[] {
  const rows = dates.map((date, i) => {
    const row: TrendSeriesPoint = { date, total: 0, block_rate: 0, change: i === 0 ? null : 0 };
    keys.forEach((key, keyIndex) => {
      const value = Math.max(0, Math.round((bases[keyIndex] + Math.sin(i * 1.37 + keyIndex) * bases[keyIndex] * 0.18) * scale));
      row[key] = value;
      row.total += value;
    });
    row.block_rate = Number((96.2 + (i % 3) * 0.7).toFixed(1));
    return row;
  });
  rows.forEach((row, i) => {
    const previousTotal = i > 0 ? rows[i - 1].total : 0;
    const change = i > 0 ? row.total - previousTotal : 0;
    row.change = change;
    row.change_pct = previousTotal > 0 ? (change / previousTotal) * 100 : 0;
  });
  return rows;
}

function buildThreatOverviewRows(
  dates: string[],
  scale = 1,
): TrendSeriesPoint[] {
  const wave = (i: number, base: number, amplitude: number, period: number, phase: number) =>
    Math.max(0, Math.round((base + amplitude * Math.sin((i / period) * Math.PI * 2 + phase)) * scale));

  const rows: TrendSeriesPoint[] = dates.map((date, i) => {
    const values = {
      normal: threatSeriesValue(i, 200, 400, scale),
      phishing: wave(i, 38, 16, 8, -0.7),
      spoofing: wave(i, 19, 10, 6, 0.9),
      spam: wave(i, 70, 22, 12, -1.2),
      virus: wave(i, 9, 5, 10, 0.3),
      malicious: wave(i, 19, 7, 14, 1.5),
      suspicious: 0,
      high_risk_spam: 0,
      invalid: 0,
    };
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return {
      date,
      total,
      block_rate: Number((96.2 + (i % 3) * 0.7).toFixed(1)),
      change: null,
      ...values,
    };
  });

  rows.forEach((row, i) => {
    const previousTotal = i > 0 ? rows[i - 1].total : 0;
    const change = i > 0 ? row.total - previousTotal : 0;
    row.change = change;
    row.change_pct = previousTotal > 0 ? (change / previousTotal) * 100 : 0;
  });
  return rows;
}

const EMAIL_TYPE_KEYS = [
  "normal", "subscription", "advertising", "spam", "harmful", "suspicious",
  "sensitive", "spoofing", "phishing", "virus", "account_compromised",
];
// 与后端 internal/models/security_overview.go 的 AllActions 一致（第 3 项是
// advanced_review，不是 greylist——展示文案仍是"灰名单"，见 messages）。
const ACTION_KEYS = ["deliver", "mark_deliver", "advanced_review", "quarantine", "review", "block", "drop", "recall"];
const LEVEL_KEYS = ["normal", "low", "medium", "high", "critical"];
const DELIVERY_KEYS = ["delivered", "failed", "cancelled", "in_delivery", "partial_delivered", "unknown"];

function buildOverviewTrend(scale = 1, dates: string[] = SECURITY_DATES) {
  return {
    threat_type: buildThreatOverviewRows(dates, scale),
    email_type: buildOverviewRows(EMAIL_TYPE_KEYS, [820, 110, 96, 210, 34, 72, 18, 28, 64, 18, 12], scale, dates),
    action: buildOverviewRows(ACTION_KEYS, [860, 180, 90, 120, 76, 280, 48, 22], scale, dates),
    threat_level: buildOverviewRows(LEVEL_KEYS, [820, 310, 180, 96, 38], scale, dates),
    delivery_result: buildOverviewRows(DELIVERY_KEYS, [1320, 76, 18, 54, 33, 12], scale, dates),
  };
}

export function mockSecurityOverviewFor(
  startDate: string,
  endDate: string,
  comparePrevious = false,
  interval?: string,
): SecurityOverviewResponse {
  const { range } = noteDashboardWindow(startDate, endDate);
  const hourly = interval === "hour" && startDate !== "" && startDate === endDate;
  const dates = hourly
    ? Array.from({ length: 24 }, (_, hour) => `${startDate} ${String(hour).padStart(2, "0")}:00:00`)
    : range === "today"
      ? [startDate || SECURITY_DATES[0]]
      : range === "7d"
        ? SECURITY_DATES
        : Array.from({ length: 30 }, (_, day) => `1/${day + 1}`);
  const scale = range === "today" ? 1 : range === "7d" ? 6 : 5;
  const trend = buildOverviewTrend(scale, dates);
  const previous = comparePrevious ? buildOverviewTrend(scale * 0.91, dates) : null;
  return {
    kpi: SECURITY_KPI,
    distribution: [
      { name: "phishing", value: 1_420 }, { name: "spam", value: 4_680 },
      { name: "virus", value: 286 }, { name: "spoofing", value: 714 },
    ],
    trend,
    trend_previous: previous,
    trend_previous_period: previous,
    detail_table: trend,
  };
}

const GEO_COUNTRIES = [
  ["US", 1245, 97.2], ["BR", 532, 95.1], ["NL", 356, 98.3], ["RU", 289, 96.5],
  ["CN", 234, 99.1], ["DE", 198, 97.8], ["IN", 167, 94.2], ["VN", 145, 96.9],
  ["NG", 123, 93.5], ["PH", 98, 95.8],
] as const;

export function mockSecurityGeo(threatFilter = "all"): GeoDistributionResponse {
  const EMAIL_TYPE_FACTORS: Record<string, number> = {
    normal: 0.65, subscription: 0.12, advertising: 0.10, spam: 0.52,
    harmful: 0.18, suspicious: 0.22, sensitive: 0.08, spoofing: 0.14,
    phishing: 0.31, virus: 0.17, account_compromised: 0.05,
  };
  const factor = threatFilter === "all" ? 1 : (EMAIL_TYPE_FACTORS[threatFilter] ?? 0.15);
  return {
    countries: GEO_COUNTRIES.map(([country, count, block_rate]) => ({ country, count: Math.round(count * factor), block_rate })),
    summary_top3: GEO_COUNTRIES.slice(0, 3).map(([country]) => country),
  };
}

export function mockSecurityTime(mode: "daily" | "weekly" = "daily", threatFilter = "all"): TimeDistributionResponse {
  const EMAIL_TYPE_FACTORS: Record<string, number> = {
    normal: 0.65, subscription: 0.12, advertising: 0.10, spam: 0.52,
    harmful: 0.18, suspicious: 0.22, sensitive: 0.08, spoofing: 0.14,
    phishing: 0.31, virus: 0.17, account_compromised: 0.05,
  };
  const factor = threatFilter === "all" ? 1 : (EMAIL_TYPE_FACTORS[threatFilter] ?? 0.15);
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const wave = 80 + Math.round(130 * (1 + Math.sin((hour - 7) / 3)) / 2) + (hour === 13 ? 75 : 0);
    const total = Math.round(wave * factor);
    return {
      hour, total,
      normal:              Math.round(total * 0.20),
      subscription:        Math.round(total * 0.05),
      advertising:         Math.round(total * 0.04),
      spam:                Math.round(total * 0.22),
      harmful:             Math.round(total * 0.08),
      suspicious:          Math.round(total * 0.10),
      sensitive:           Math.round(total * 0.04),
      spoofing:            Math.round(total * 0.06),
      phishing:            Math.round(total * 0.12),
      virus:               Math.round(total * 0.07),
      account_compromised: Math.round(total * 0.02),
    };
  });
  const peak_hours = [...hourly].sort((a, b) => b.total - a.total).slice(0, 4).map(({ hour, total }) => ({ hour, count: total }));
  return {
    mode,
    buckets: hourly.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, attack_count: h.total, total_count: h.total + 50 })),
    hourly,
    peak_hours,
    weekly_matrix: mode === "weekly"
      ? Array.from({ length: 7 * 24 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24, value: Math.round(hourly[index % 24].total * (0.65 + Math.floor(index / 24) * 0.07)) }))
      : undefined,
  };
}

const DRILL_NAMES: Record<DrillDimension, string[]> = {
  action: ["block", "quarantine", "review", "drop", "recall"],
  sender_domain: ["notice-secure.example", "billing-alert.example", "mail-update.example", "promo.example", "unknown.example"],
  client_ip: ["203.0.113.42", "198.51.100.18", "192.0.2.77", "203.0.113.90", "198.51.100.31"],
  matched_rule: ["仿冒登录页", "恶意附件", "高危垃圾邮件", "异常发件域", "批量外发"],
};

export function mockSecurityDrill(dimension: DrillDimension): DrillDownResponse {
  return {
    items: DRILL_NAMES[dimension].map((name, i) => ({ name, count: [486, 312, 205, 128, 74][i] })),
    filter_query: `dimension=${dimension}`,
  };
}

export const mockSecurityEscapes: EscapeListResponse = {
  total: 12,
  items: [
    { id: 1, message_id: "<escape-001@example>", subject: "紧急：账户安全验证", sender: "security@notice-secure.example", recipients: ["alice@example.com"], recalled_at: "2026-07-22 10:32:18", recall_reason: "事后确认钓鱼链接" },
    { id: 2, message_id: "<escape-002@example>", subject: "发票附件更新", sender: "billing@billing-alert.example", recipients: ["finance@example.com"], recalled_at: "2026-07-22 09:18:04", recall_reason: "沙箱补判恶意附件" },
    { id: 3, message_id: "<escape-003@example>", subject: "密码即将过期", sender: "admin@mail-update.example", recipients: ["ops@example.com"], recalled_at: "2026-07-21 17:46:51", recall_reason: "域名信誉降级后召回" },
  ],
};

export { mockSecurityCsv, mockSecurityAiMarkdown } from "./security-overview-fixtures";

// ─── 邮件路由 html_spec 对齐（Task 2 mock 基建）───────────────────────────
// 数据与 CRUD 都在独立文件维护，这里按既有惯例整体 re-export，
// 供 dispatcher.ts 沿用统一的单一 import 面。
export * from "./mail-routing-fixtures";

// ─── 邮件类型趋势（/statistics/type，已 mock，改为范围感知）────────────────────
// 说明：本仪表盘的威胁趋势改由 security-overview.trend.threat_type 提供；此处仍把
// 早先固定的 /statistics/type 改成范围感知、非空的 time_series，避免其它页面/旧
// 消费路径拿到空序列，并保持 EmailType 键形状。
function isoDay(offsetFromNewest: number, newestOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (newestOffset - offsetFromNewest));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function buildTypeBuckets(
  range: SystemStatusRangeKey,
): TypeStatisticsResponse["time_series"] {
  const points = range === "today" ? 12 : range === "7d" ? 7 : 30;
  const scale = range === "today" ? 1 : range === "7d" ? 6 : 5;
  const today = new Date().toISOString().slice(0, 10);
  const series: TypeStatisticsResponse["time_series"] = [];
  for (let i = 0; i < points; i++) {
    const timestamp =
      range === "today"
        ? `${today} ${String(i * 2).padStart(2, "0")}:00:00`
        : isoDay(i, points - 1);
    // demo 5 类威胁映射到最接近的 EmailType 键（malicious→harmful），其余给 0/低位。
    const counts = {} as Record<EmailType, number>;
    for (const key of EMAIL_TYPES) counts[key] = 0;
    counts.phishing = threatSeriesValue(i, 20, 40, scale);
    counts.spoofing = threatSeriesValue(i, 10, 30, scale);
    counts.spam = threatSeriesValue(i, 40, 80, scale);
    counts.virus = threatSeriesValue(i, 3, 15, scale);
    counts.harmful = threatSeriesValue(i, 8, 25, scale);
    counts.normal = threatSeriesValue(i, 200, 400, scale);
    series.push({ timestamp, counts });
  }
  return series;
}

export function mockTypeStatistics(
  range: SystemStatusRangeKey = "today",
): TypeStatisticsResponse {
  const buckets = buildTypeBuckets(range);
  const type_counts = {} as Record<EmailType, number>;
  for (const key of EMAIL_TYPES) type_counts[key] = 0;
  for (const b of buckets) {
    for (const key of EMAIL_TYPES) type_counts[key] += b.counts[key];
  }
  return { type_counts, time_series: buckets };
}

// ─── 威胁来源 TOP5（/statistics/ops-top，dimension=sender，sort=threat）─────────
// 命中数放在 OpsTopRow.metrics.threatCount（threat-top5.tsx 读的就是这个字段）。
const THREAT_TOP5: Record<
  SystemStatusRangeKey,
  { source: string; hits: number }[]
> = {
  today: [
    { source: "spam-sender.com", hits: 312 },
    { source: "192.168.66.12", hits: 244 },
    { source: "bad-domain.cn", hits: 187 },
    { source: "phish-mail.net", hits: 121 },
    { source: "203.0.113.45", hits: 96 },
  ],
  "7d": [
    { source: "bad-domain.cn", hits: 1820 },
    { source: "spam-sender.com", hits: 1542 },
    { source: "phish-mail.net", hits: 1103 },
    { source: "198.51.100.7", hits: 884 },
    { source: "fake-bank.top", hits: 651 },
  ],
  "30d": [
    { source: "bad-domain.cn", hits: 7420 },
    { source: "phish-mail.net", hits: 6210 },
    { source: "spam-sender.com", hits: 5980 },
    { source: "fake-bank.top", hits: 3140 },
    { source: "203.0.113.45", hits: 2870 },
  ],
};

export function mockOpsTopThreat(range: SystemStatusRangeKey): OpsTopResponse {
  const list = THREAT_TOP5[range];
  const rows: OpsTopRow[] = list.map((item, idx) => ({
    rank: idx + 1,
    key: item.source,
    name: item.source,
    metrics: { threatCount: item.hits, sendCount: item.hits },
    change: 0,
    changePercent: null,
    isSpike: false,
    trend: [],
  }));
  return {
    dimension: "sender",
    total: list.reduce((sum, i) => sum + i.hits, 0),
    rows,
    trendLabels: [],
  };
}

// ─── 运营 TOP 与趋势（demo 同源的确定性 fixture）──────────────────────────
// The source demo uses mulberry32 + FNV-1a so a tenant keeps the same data
// across interactions. Keep that contract here; only normalize demo-only
// threat labels to the backend taxonomy consumed by TopTable.
function makeOpsRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashOpsString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function opsTenantScale(seed: number, allTenants: boolean) {
  return allTenants ? 1 : 0.08 + makeOpsRng(seed)() * 0.32;
}

function normalizedThreat(index: number): string {
  return ["phishing", "spam", "virus", "suspicious", "suspicious"][index % 5];
}

export function mockOpsTopFor(
  dimension: OpsDimension,
  top: OpsTopCount,
  tenantKey = "all",
  timeRange = "7d",
): OpsTopResponse {
  // The prototype keeps a stable fixture while the selected range changes.
  void timeRange;
  const count = Number(top);
  const tenantSeed = tenantKey === "all" ? 1 : hashOpsString(tenantKey);
  const scale = opsTenantScale(tenantSeed, tenantKey === "all");
  // Keep the demo fixture's stable per-dimension sequence so the implementation
  // and prototype render the same ranking rows during visual verification.
  const rng = makeOpsRng(tenantSeed ^ hashOpsString(`top:${dimension}`));
  const geoLocations = ["美国 弗吉尼亚", "中国 北京", "德国 法兰克福", "日本 东京", "新加坡"];
  const failReasons = ["wrongPassword", "accountLocked", "ipBlocked", "policyReject"];
  const departments = ["IT", "HR", "Finance", "Sales", "Marketing"];
  const domains = ["company.com", "example.org", "test.net", "corp.io", "mail.com"];

  const rows = Array.from({ length: count }, (_, index): OpsTopRow => {
    const isInternal = index % 3 === 0;
    const total = Math.max(1, Math.floor((rng() * 10000 + 100) * scale));
    const success = Math.floor(total * (0.7 + rng() * 0.25));
    const failure = total - success;
    const change = Math.floor((rng() * 500 - 100) * scale);
    const previous = total - change;
    const changePercent = previous <= 0 ? null : Math.round((change / previous) * 100);
    const trend = Array.from({ length: 7 }, () => Math.floor(rng() * (total / 7) * 2));
    const base = {
      rank: index + 1,
      change,
      changePercent,
      isSpike: change > 100 * scale && total > 500 * scale,
      trend,
    };

    if (dimension === "connection") {
      const ip = isInternal
        ? `10.188.188.${Math.floor(rng() * 255)}`
        : `45.33.32.${Math.floor(rng() * 255)}`;
      return {
        ...base,
        key: ip,
        name: ip,
        metrics: {
          sourceIp: ip,
          geoLocation: isInternal ? "internal" : geoLocations[index % geoLocations.length],
          totalConn: total,
          avgMessagesPerConnection: Math.round((1 + rng() * 5) * 10) / 10,
          successCount: success,
          failureCount: failure,
          failureRate: Math.round((failure / total) * 100),
          firstConn: `05-${10 + (index % 15)} 08:${String(10 + index).padStart(2, "0")}`,
          lastConn: `05-${20 + (index % 5)} 16:${String(30 + index).padStart(2, "0")}`,
          isInternal,
        },
      };
    }
    if (dimension === "auth") {
      const ip = isInternal
        ? `192.168.1.${Math.floor(rng() * 255)}`
        : `203.0.113.${Math.floor(rng() * 255)}`;
      const account = `${["admin", "user", "service", "api", "noreply"][index % 5]}@${domains[index % domains.length]}`;
      return {
        ...base,
        key: ip,
        name: account,
        metrics: {
          sourceIp: ip,
          authAccount: account,
          authCount: total,
          successCount: success,
          failureCount: failure,
          failReason: failure > 0 ? failReasons[index % failReasons.length] : null,
          bruteForce: failure > 50 && failure / total > 0.5,
          firstAuth: `05-${10 + (index % 15)} 09:${String(10 + index).padStart(2, "0")}`,
          isInternal,
        },
      };
    }
    if (dimension === "sendIp") {
      const ip = isInternal
        ? `10.188.188.${Math.floor(rng() * 255)}`
        : `198.51.100.${Math.floor(rng() * 255)}`;
      return {
        ...base,
        key: ip,
        name: ip,
        metrics: {
          sourceIp: ip,
          geoLocation: isInternal ? "internal" : geoLocations[index % geoLocations.length],
          sendCount: total,
          threatCount: Math.floor(total * rng() * 0.3),
          blockRate: Math.round(70 + rng() * 25),
          bounceCount: Math.floor(total * rng() * 0.1),
          relatedSenders: Math.floor(rng() * 20) + 1,
          firstSend: `05-${10 + (index % 15)} 10:${String(10 + index).padStart(2, "0")}`,
          isInternal,
        },
      };
    }
    if (dimension === "subject") {
      const prefix = ["Invoice #", "Payment Required - ", "Account Security Alert: ", "Your Order #", "Meeting Request: ", "Urgent: Verify Your "][index % 6];
      const subject = `${prefix}${Math.floor(rng() * 10000)}`;
      return {
        ...base,
        key: subject,
        name: subject,
        metrics: {
          subjectKeyword: subject,
          occurCount: total,
          relatedThreatType: normalizedThreat(index),
          targetCount: Math.floor(rng() * 50) + 5,
          blockRate: Math.round(60 + rng() * 35),
          deliveryRate: Math.round(rng() * 30),
          firstSeen: `05-${10 + (index % 15)}`,
          isInternal: false,
        },
      };
    }
    if (dimension === "sender") {
      const domain = domains[index % domains.length];
      const sender = `${["support", "billing", "noreply", "info", "sales"][index % 5]}@${domain}`;
      return {
        ...base,
        key: sender,
        name: sender,
        metrics: {
          senderEmail: sender,
          senderDomain: domain,
          sendCount: total,
          threatCount: Math.floor(total * rng() * 0.2),
          blockRate: Math.round(70 + rng() * 25),
          bounceRate: Math.round(rng() * 15),
          topSendIps: `10.1.1.${index + 1}, 10.1.1.${index + 2}, 10.1.1.${index + 3}`,
          firstSend: `05-${10 + (index % 15)} 11:${String(10 + index).padStart(2, "0")}`,
          isInternal: domain === "company.com",
        },
      };
    }
    const domain = domains[index % domains.length];
    const recipient = `${["ceo", "hr", "finance", "it", "admin"][index % 5]}@${domain}`;
    return {
      ...base,
      key: recipient,
      name: recipient,
      metrics: {
        recipientEmail: recipient,
        recipientDomain: domain,
        receiveCount: total,
        threatCount: Math.floor(total * rng() * 0.25),
        attackCount: Math.floor(rng() * 30) + 1,
        blockRate: Math.round(75 + rng() * 20),
        mainThreatType: normalizedThreat(index),
        department: domain === "company.com" ? departments[index % departments.length] : "external",
        isInternal: domain === "company.com",
      },
    };
  });

  const primary = (row: OpsTopRow) => Number(
    row.metrics.totalConn ?? row.metrics.authCount ?? row.metrics.sendCount ??
    row.metrics.occurCount ?? row.metrics.receiveCount ?? 0,
  );
  rows.sort((a, b) => primary(b) - primary(a));
  rows.forEach((row, index) => { row.rank = index + 1; });
  const labels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });
  return { dimension, total: count, rows, trendLabels: labels };
}

export function mockOpsDrilldownFor(
  subDim: string,
  tenantKey = "all",
  itemKey = "none",
): OpsDrilldownResponse {
  const tenantSeed = tenantKey === "all" ? 1 : hashOpsString(tenantKey);
  const scale = opsTenantScale(tenantSeed, tenantKey === "all");
  const rng = makeOpsRng(tenantSeed ^ hashOpsString(`drill:${subDim}:${itemKey}`));
  const names: Record<string, string[]> = {
    senderTop: ["evil@company.com", "spam@example.org", "phish@evil.com", "fake@fake-domain.com", "bad@mail.com"],
    subjectTop: ["Invoice #1234", "Payment Required", "Account Alert", "Urgent: Verify", "Your Order"],
    recipientTop: ["ceo@company.com", "hr@company.com", "finance@company.com", "it@company.com", "admin@company.com"],
    sendIpTop: ["10.188.188.12", "192.168.1.44", "45.33.32.87", "203.0.113.19", "194.165.16.8"],
    authFailReason: ["wrongPassword", "accountLocked", "ipBlocked", "tooManyAttempts"],
    threatTypeDistrib: ["phishing", "spam", "virus", "suspicious", "high_risk_spam"],
    bounceReason: ["userNotExist", "mailboxFull", "policyReject", "dnsFailure", "timeout"],
    attackTypeDistrib: ["phishing", "high_risk_spam", "virus", "spam", "suspicious"],
    authRecord: ["05-21 09:10", "05-22 09:15", "05-23 09:20", "05-24 09:25", "05-25 09:30"],
    connectionRecord: ["05-21 09:10", "05-22 09:15", "05-23 09:20", "05-24 09:25", "05-25 09:30"],
  };
  const items = (names[subDim] ?? []).map((name, index) => ({
    name,
    value: Math.max(1, Math.floor((rng() * (200 - index * 12) + 10) * scale)),
  }));
  return { sub_dim: subDim, items };
}

export function mockOpsTopCsv(response: OpsTopResponse): string {
  const metricKeys = response.rows[0] ? Object.keys(response.rows[0].metrics) : [];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    ["rank", ...metricKeys].map(escape).join(","),
    ...response.rows.map((row) => [row.rank, ...metricKeys.map((key) => row.metrics[key])].map(escape).join(",")),
  ].join("\n");
}

export function mockOpsTopAi(): { markdown: string } {
  return {
    markdown: "## 运营趋势摘要\n\n- 连接与发信量整体稳定，TOP 来源集中���较高。\n- ���议优先复核失败率超过 50% 的连接来源及持��飙升对象。\n- 展开行可查看固��近 7 ���趋势与关联子维度。",
  };
}

// ─── 监控 / ���点（/monitor/nodes，retune 为 NodeInfo 形状，5 节点全在线）────────
export function mockMonitorDashboardOverview(range: MonitorDashboardRange): MonitorDashboardOverview {
  const volumes: Record<MonitorDashboardRange, number> = {
    today: 125847,
    "24h": 252300,
    "7d": 902331,
    "30d": 3820100,
  };
  return {
    range,
    kpi: {
      today_volume: volumes[range],
      volume_change: 8.3,
      delivery_success_rate: 97.2,
      delivery_success_change: 0.4,
      queue_depth: 1240,
      threats: 4,
      nodes_online: 5,
      nodes_total: 5,
      engines_healthy: 4,
      engines_total: 4,
      todo: 2,
      critical_todo: 1,
      major_todo: 1,
    },
    infrastructure: {
      cpu_usage: 45,
      memory_usage: 62,
      disk_usage: 78,
      database_status: "ok",
      status: "normal",
    },
    mailflow_health: { queue_depth: 1240, latency_p95: 1.2, status: "warning" },
    engine_health: [
      { key: "antispam", status: "normal" },
      { key: "antivirus", status: "normal" },
      { key: "sandbox", status: "normal" },
      { key: "rbl", status: "normal" },
    ],
    alert_health: { unconfirmed: 2, processing: 5, resolved: 12 },
    recent_alerts: [
      { id: 1, time: "2026-07-23T10:03:00+08:00", module: "基础设施", message: "数据目录使用率 96%", status: "unconfirmed", severity: "critical" },
      { id: 2, time: "2026-07-23T09:51:00+08:00", module: "邮件流", message: "deferred队列堆积 62,341", status: "processing", severity: "critical" },
      { id: 3, time: "2026-07-23T09:30:00+08:00", module: "检测引擎", message: "RBL响应超时 >5s", status: "confirmed", severity: "warning" },
      { id: 4, time: "2026-07-23T09:15:00+08:00", module: "邮件流", message: "投递延时P95 >10s", status: "resolved", severity: "warning" },
    ],
    mailflow_trend: Array.from({ length: 24 }, (_, i) => ({
      time: `${String(i).padStart(2, "0")}:00`,
      volume: 4200 + i * 95 + (i >= 8 && i <= 18 ? 1800 : 0),
      latency_p95: Number((1.5 + (i % 5) * 0.4).toFixed(1)),
    })),
    engine_trend: Array.from({ length: 24 }, (_, i) => ({
      time: `${String(i).padStart(2, "0")}:00`,
      antispam: 720 + i * 11,
      antivirus: 90 + (i % 6) * 8,
      sandbox: 12 + (i % 4) * 3,
      rbl: 2100 + i * 31,
    })),
    degraded: false,
  };
}

export const mockNodes: NodesResp = {
  items: Array.from({ length: 5 }, (_, i) => ({
    id: `mock-node-${i + 1}`,
    last_seen_unix: Math.floor(Date.now() / 1000) - i * 5,
    online: true,
  })),
};

function monitorPoints(length: number, base: number, step: number) {
  return Array.from({ length }, (_, i) => ({
    ts: length === 7 ? `${i + 1}日` : `${String(i).padStart(2, "0")}:00`,
    value: Number((base + Math.sin(i / 2) * step + i * step * 0.08).toFixed(1)),
  }));
}

export function mockMonitorHardware(range: "1h" | "24h" | "7d"): HardwareResp {
  const count = range === "1h" ? 12 : range === "7d" ? 7 : 24;
  return {
    cpu_mem: { points: monitorPoints(count, 45, 8) },
    mem_trend: { points: monitorPoints(count, 62, 5) },
    network_top5: [
      { device: "eth0", rx_pps: 12540, tx_pps: 8630, drop_rate: 0.02, retransmit_rate: 0.12 },
      { device: "eth1", rx_pps: 8920, tx_pps: 6740, drop_rate: 0.01, retransmit_rate: 0.08 },
      { device: "docker0", rx_pps: 4210, tx_pps: 3980, drop_rate: 0, retransmit_rate: 0.03 },
      { device: "lo", rx_pps: 3180, tx_pps: 3180, drop_rate: 0, retransmit_rate: 0 },
      { device: "br-abc123", rx_pps: 1850, tx_pps: 1620, drop_rate: 0.01, retransmit_rate: 0.04 },
    ],
  };
}

export const mockMonitorProcesses: ProcessesResp = {
  docker: { running: 8, stopped: 1, restarts: 2 },
  overlay2_usage: 72,
  processes: [
    { name: "Postfix", status: "running", pid: 1024, memory: 256 * 1024 * 1024 },
    { name: "ClamAV", status: "running", pid: 1108, memory: 1536 * 1024 * 1024 },
    { name: "Elasticsearch", status: "warning", pid: 1216, memory: 4096 * 1024 * 1024 },
    { name: "Kingbase", status: "running", pid: 1324, memory: 2048 * 1024 * 1024 },
    { name: "Redis", status: "running", pid: 1412, memory: 384 * 1024 * 1024 },
  ],
};

export const mockMonitorContainers: DockerContainersResp = {
  containers: [
    { name: "osgateway-apiserver", state: "running", image: "osgateway-apiserver:8.0" },
    { name: "osgateway-antispam", state: "running", image: "osgateway-antispam:8.0" },
    { name: "osgateway-redis", state: "running", image: "redis:7" },
    { name: "osgateway-database", state: "running", image: "osgateway-opengauss:1.0.0" },
  ],
};

export function mockMonitorDatabase(range: "1h" | "24h" | "7d"): DatabaseResp {
  const count = range === "1h" ? 12 : range === "7d" ? 7 : 24;
  return {
    conn_trend: { points: monitorPoints(count, 45, 6) },
    latency_trend: { points: monitorPoints(count, 45, 12) },
    slow_queries: [
      { query: "SELECT * FROM mail_logs WHERE tenant_id = ? ORDER BY created_at DESC", exec_count: 128, avg_ms: 326, total_ms: 41728 },
      { query: "SELECT rule_id, COUNT(*) FROM rejection_logs GROUP BY rule_id", exec_count: 64, avg_ms: 245, total_ms: 15680 },
      { query: "UPDATE alert_events SET status = ? WHERE id = ?", exec_count: 31, avg_ms: 188, total_ms: 5828 },
    ],
    lock_waits: [{ wait_type: "transaction", wait_object: "mail_logs", wait_ms: 142 }],
    status: {
      db: { status: "normal", latency_ms: 12 },
      redis: { status: "normal", latency_ms: 2 },
    },
    supported: true,
    db_backend: "openGauss",
    cache_hit_ratio: 98.6,
    active_conns: 45,
    db_size_bytes: 128849018880,
  };
}

export const mockMonitorStorage: StorageResp = {
  partitions: [
    { device: "/dev/sda1", mount: "/", total_bytes: 107374182400, used_bytes: 48318382080, usage_pct: 45 },
    { device: "/dev/sdb1", mount: "/var/spool/postfix", total_bytes: 214748364800, used_bytes: 167503724544, usage_pct: 78 },
    { device: "/dev/sdc1", mount: "/home/coremail/data", total_bytes: 536870912000, used_bytes: 472446402560, usage_pct: 88 },
    { device: "/dev/sdd1", mount: "/backup", total_bytes: 1099511627776, used_bytes: 681697209221, usage_pct: 62 },
  ],
};

export const mockMonitorBackup: BackupResp = {
  tasks: [
    { id: "database-daily-20260723T020000Z", name: "database-daily", exec_time: "2026-07-23T02:00:00Z", duration: 128, size: 12884901888, status: "success" },
    { id: "config-hourly-20260723T150000Z", name: "config-hourly", exec_time: "2026-07-23T15:00:00Z", duration: 18, size: 536870912, status: "success" },
    { id: "mail-archive-20260722T233000Z", name: "mail-archive", exec_time: "2026-07-22T23:30:00Z", duration: 642, size: 68719476736, status: "success" },
  ],
};

export function mockMonitorBackupDetail(id: string) {
  const task = mockMonitorBackup.tasks.find((item) => item.id === id);
  if (!task) return null;
  return {
    ...task,
    node: "node-1",
    log: `[${task.exec_time}] starting ${task.name}\nbackup completed successfully\nbytes=${task.size}`,
  };
}

export const mockMonitorRuntime: RuntimeResp = {
  services: [
    { name: "apiserver", goroutine: 86, heap_alloc: 188743680, uptime: "12d 4h" },
    { name: "antispam", goroutine: 132, heap_alloc: 314572800, uptime: "12d 4h" },
    { name: "authd", goroutine: 41, heap_alloc: 94371840, uptime: "12d 4h" },
  ],
};

export const mockMonitorRuntimeTrend: ServiceTrendResp = {
  goroutine: { apiserver: { points: monitorPoints(24, 86, 8) }, antispam: { points: monitorPoints(24, 132, 12) } },
  heap: { apiserver: { points: monitorPoints(24, 180, 16) }, antispam: { points: monitorPoints(24, 300, 24) } },
};

export function mockMonitorSecurity(
  engine: SecurityEngine,
  range: SecurityTimeRange,
): SecurityEngineResp {
  const count = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const base: Record<SecurityEngine, [number, number]> = {
    antispam: [850, 95],
    antivirus: [145, 120],
    sandbox: [45, 6],
    rbl: [1200, 1.2],
  };
  const trend = Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index / Math.max(count - 1, 1)) * Math.PI * 2);
    return {
      ts: range === "24h" ? `${String(index).padStart(2, "0")}:00` : `${index + 1}日`,
      primary: Number((base[engine][0] * (1 + wave * 0.16)).toFixed(1)),
      secondary: Number((base[engine][1] * (1 + wave * 0.22)).toFixed(1)),
    };
  });
  const factor = range === "7d" ? 1.08 : range === "30d" ? 1.15 : 1;
  let details: SecurityEngineResp["details"];
  if (engine === "sandbox") {
    details = [42, 46, 48].map((seconds, index) => ({
      id: `sandbox-${index + 1}`,
      node_name: `sandbox-0${index + 1}`,
      node_status: "normal",
      average_analysis_seconds: Math.round(seconds * factor),
      queue_length: Math.round([5, 7, 6][index] * factor),
      node_load_pct: Math.round([45, 52, 49][index] * factor),
    }));
  } else if (engine === "rbl") {
    details = [
      ["spamhaus", "Spamhaus ZEN", 980, 0.8, 560],
      ["spamcop", "SpamCop", 1200, 1.2, 420],
      ["barracuda", "Barracuda", 1400, 1.8, 380],
      ["sorbs", "SORBS", 1100, 1.0, 310],
    ].map(([id, source, latency, timeout, throughput]) => ({
      id: String(id),
      rbl_source: String(source),
      average_response_ms: Number(latency) * factor,
      timeout_rate: Number(timeout) * factor,
      query_throughput: Number(throughput) * factor,
    }));
  } else {
    const rowCount = range === "24h" ? 4 : count;
    details = Array.from({ length: rowCount }, (_, index) => ({
      id: `${engine}-${index}`,
      instance_id: `${engine}-01`,
      time_period: range === "24h"
        ? `${String(index * 6).padStart(2, "0")}:00-${String((index + 1) * 6).padStart(2, "0")}:00`
        : `${index + 1}日`,
      ...(engine === "antispam"
        ? { scan_throughput: [820, 890, 950, 780][index % 4], queue_backlog: [12, 8, 25, 5][index % 4] }
        : { attachment_throughput: [128, 152, 178, 115][index % 4], large_file_timeout: [1, 0, 2, 0][index % 4] }),
      average_latency_ms: engine === "antispam"
        ? [95, 88, 102, 78][index % 4]
        : [108, 122, 142, 102][index % 4],
    }));
  }
  return {
    engine,
    range,
    cards: [
      { key: "antispam", status: "normal", primary_value: 850 },
      { key: "antivirus", status: "normal", primary_value: 120 },
      { key: "sandbox", status: "normal", primary_value: 45 },
      { key: "rbl", status: "normal", primary_value: 1200 },
    ],
    trend,
    details,
    collected_at: "2026-07-23T10:00:00+08:00",
    approximate: engine === "rbl",
  };
}

function mailflowMultiplier(direction: MailflowDirection) {
  return direction === "all" ? 2.1 : direction === "send" ? 0.7 : direction === "internal" ? 0.4 : 1;
}

export function mockMailflowQueue(range: "1h" | "24h" | "7d", direction: MailflowDirection): MailflowQueueResp {
  const rangeMultiplier = range === "1h" ? 0.75 : range === "7d" ? 1.35 : 1;
  const directionMultiplier = direction === "send" ? 1.5 : direction === "internal" ? 0.8 : direction === "all" ? 1.1 : 1;
  const latencyMultiplier = rangeMultiplier * directionMultiplier;
  return {
  depth: [
    { queue: "incoming", value: 245, status: "normal" },
    { queue: "active", value: 1823, status: "normal" },
    { queue: "deferred", value: 12450, status: "warning" },
    { queue: "held", value: 45, status: "normal" },
    { queue: "corrupt", value: 3, status: "normal" },
  ],
  age: [
    { bucket: "0-5min", pct: 45, status: "normal" },
    { bucket: "5-30min", pct: 30, status: "normal" },
    { bucket: "30min-4h", pct: 20, status: "warning" },
    { bucket: "gt4h", pct: 5, status: "critical" },
  ],
  latency: {
    avg: Number((1.2 * latencyMultiplier).toFixed(2)),
    p95: Number((3.5 * latencyMultiplier).toFixed(2)),
    p99: Number((8.2 * latencyMultiplier).toFixed(2)),
    avg_status: "normal",
    p95_status: "normal",
    p99_status: latencyMultiplier >= 1 ? "warning" : "normal",
  },
  };
}

export function mockMailflowQueueTrend(range: "1h" | "24h" | "7d") {
  const count = range === "1h" ? 12 : range === "7d" ? 7 : 24;
  return {
    series: {
      incoming: { points: monitorPoints(count, 245, 38) },
      active: { points: monitorPoints(count, 1823, 160) },
      deferred: { points: monitorPoints(count, 12450, 920) },
      held: { points: monitorPoints(count, 45, 8) },
      corrupt: { points: monitorPoints(count, 3, 1) },
    },
  };
}

export function mockMailflowDelivery(range: "1h" | "24h" | "7d", direction: MailflowDirection): MailflowDeliveryResp {
  const count = range === "1h" ? 12 : range === "7d" ? 7 : 24;
  const multiplier = direction === "send" ? 1.5 : direction === "internal" ? 0.8 : direction === "all" ? 1.1 : 1;
  return {
    trend: Array.from({ length: count }, (_, i) => ({
      ts: count === 7 ? `${i + 1}日` : `${String(i).padStart(2, "0")}:00`,
      avg: Number((1.2 * multiplier + (i % 4) * 0.18).toFixed(2)),
      p95: Number((3.5 * multiplier + (i % 5) * 0.32).toFixed(2)),
      p99: Number((8.2 * multiplier + (i % 3) * 0.55).toFixed(2)),
    })),
    approx: false,
  };
}

const bounceDomains = [
  "example.com", "test.cn", "company.org", "mail.net", "corp.io",
  "partner.co", "sample.edu", "vendor.biz", "service.dev", "customer.app",
];

export function mockMailflowBounce(direction: MailflowDirection): MailflowBounceResp {
  const multiplier = mailflowMultiplier(direction);
  return {
    top_domains: bounceDomains.map((domain, i) => {
      const rate5xx = Number((1.2 + (i % 5) * 0.9 + (direction === "send" ? 0.7 : 0)).toFixed(1));
      return {
        domain,
        rate_5xx: rate5xx,
        rate_4xx: Number((0.5 + (i % 4) * 0.6).toFixed(1)),
        rate_5xx_status: rate5xx > 4 ? "critical" : "normal",
        rate_4xx_status: "normal",
        attempts: Math.round((12450 - i * 910) * multiplier),
        last_bounce: `${i * 3 + 2}分钟前`,
      };
    }),
    reasons: [
      { code: "550", count: 4520, percent: 45 },
      { code: "551", count: 2340, percent: 23 },
      { code: "552", count: 1560, percent: 16 },
      { code: "553", count: 890, percent: 9 },
      { code: "Other", count: 720, percent: 7 },
    ],
  };
}

export function mockMailflowConnection(direction: MailflowDirection): MailflowConnectionResp {
  const multiplier = mailflowMultiplier(direction);
  const upstream = Math.round(8500 * multiplier);
  const downstream = Math.round(7900 * multiplier);
  const failed = Math.round(560 * multiplier);
  const total = upstream + downstream;
  const failedRate = Number(((failed / total) * 100).toFixed(1));
  return {
    kpi: {
      upstream, downstream, stage_diff: upstream - downstream, failed_count: failed,
      failed_rate: failedRate, avg_resp_ms: direction === "send" ? 1200 : direction === "internal" ? 280 : 450,
      calibrating: false, stage_diff_status: upstream - downstream > 500 ? "critical" : "warning",
      failed_status: failedRate > 5 ? "critical" : failedRate > 3 ? "warning" : "normal",
      resp_status: direction === "send" ? "warning" : "normal",
    },
    quality: { total, success: total - failed, failed, failed_rate: failedRate, calibrating: false },
  };
}

export function mockMailflowConnectionTrend(range: "1h" | "24h" | "7d", direction: MailflowDirection): MailflowConnTrendResp {
  const count = range === "1h" ? 12 : range === "7d" ? 7 : 24;
  const multiplier = mailflowMultiplier(direction);
  return {
    points: Array.from({ length: count }, (_, i) => ({
      ts: count === 7 ? `${i + 1}日` : `${String(i).padStart(2, "0")}:00`,
      upstream: Math.round((350 + (i % 6) * 16) * multiplier),
      downstream: Math.round((330 + (i % 5) * 14) * multiplier),
    })),
    calibrating: false,
  };
}

export function mockMailflowConnectionFailure(direction: MailflowDirection): MailflowConnFailureResp {
  const multiplier = mailflowMultiplier(direction);
  return {
    reasons: [
      { reason: "连接被拒（RBL/黑名单）", count: Math.round(320 * multiplier), percent: 57.1 },
      { reason: "SMTP握手超时", count: Math.round(120 * multiplier), percent: 21.4 },
      { reason: "STARTTLS失败", count: Math.round(65 * multiplier), percent: 11.6 },
      { reason: "认证失败", count: Math.round(35 * multiplier), percent: 6.3 },
      { reason: "其他", count: Math.round(20 * multiplier), percent: 3.6 },
    ],
    calibrating: false,
  };
}

// ─── 监控 / 告警中心 ──────────────────────────────────────────────────────────
// 固定时间和精确数量来自 maintained html_spec。这里做成轻量状态机，使筛选、
// 生命周期、批量操作、规则 CRUD 和 SMTP 配置都能在 mock 模式完整走通。
const ALERT_DATE = "2026-07-23";
const alertSeed = [
  [1, 101, "数据目录使用率告警", "system.data_dir_usage", "system", "node-1", "系统资源", "p0", "unconfirmed", "数据目录使用率 96%", 96, 95, 1, "10:03:25"],
  [2, 102, "deferred 队列堆积", "mailflow.queue_deferred", "mailflow_queue", "gateway-1", "邮件流", "p0", "processing", "deferred队列堆积 62,341", 62341, 50000, 3, "09:51:12"],
  [3, 104, "RBL 响应超时", "detection.rbl_latency", "detection", "engine-1", "检测引擎", "p3", "confirmed", "RBL响应超时 >5s", 5.8, 5, 5, "09:30:45"],
  [4, 103, "Kingbase 主从延迟", "database.kb_repl_delay", "database", "db-standby", "基础设施", "p1", "unconfirmed", "Kingbase主从延迟 45s", 45, 60, 1, "09:15:33"],
  [5, 105, "incoming 队列积压", "mailflow.queue_incoming", "mailflow_queue", "gateway-2", "邮件流", "p2", "resolved", "incoming队列 >5000", 5260, 5000, 2, "08:45:21"],
  [6, 106, "备份任务失败", "system.backup_status", "system", "node-2", "系统", "p4", "resolved", "备份任务完成", 1, 1, 1, "08:30:10"],
] as const;

const alertState: AlertEvent[] = alertSeed.map((row) => {
  const [id, ruleId, ruleName, metricKey, module, node, source, severity, status, message, value, threshold, count, time] = row;
  const iso = `${ALERT_DATE}T${time}+08:00`;
  return {
    id, rule_id: ruleId, rule_name: ruleName, metric_key: metricKey, module, node,
    source, fingerprint: `mock-alert-${id}`, severity, status, message,
    metric_value: value, threshold, count, first_seen_at: iso, last_seen_at: iso,
    confirmed_by: status === "confirmed" || status === "processing" || status === "resolved" ? "张运维" : null,
    confirmed_at: status === "confirmed" || status === "processing" || status === "resolved" ? iso : null,
    resolved_by: status === "resolved" ? "张运维" : null,
    resolved_at: status === "resolved" ? iso : null,
    resolved_reason: status === "resolved" ? "manual" : null,
    created_at: iso, updated_at: iso,
  };
});

export function mockDashboardAlerts(query = ""): AlertListResp {
  const p = new URLSearchParams(query);
  const q = (p.get("q") ?? "").trim().toLocaleLowerCase();
  const severity = p.get("severity");
  const status = p.get("status");
  const page = Math.max(1, Number(p.get("page") ?? 1));
  const pageSize = Math.max(1, Number(p.get("page_size") ?? 50));
  const filtered = alertState.filter((a) =>
    (!q || a.message.toLocaleLowerCase().includes(q) || a.rule_name.toLocaleLowerCase().includes(q)) &&
    (!severity || severity === "all" || a.severity === severity) &&
    (!status || status === "all" || a.status === status));
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map((a) => ({ ...a })),
    total: filtered.length, page, page_size: pageSize,
  };
}

export function mockGetAlert(id: number): AlertEvent | undefined {
  const alert = alertState.find((item) => item.id === id);
  return alert ? { ...alert } : undefined;
}

const alertStatState: AlertStats = {
  total: 156,
  unconfirmed: 12,
  processing: 8,
  resolved: 136,
  critical: 2,
  major: 5,
};

export function mockAlertStats(): AlertStats {
  return { ...alertStatState };
}

type MockAlertAction = "confirm" | "process" | "resolve";

function alertStatBucket(status: AlertEvent["status"]): "unconfirmed" | "processing" | "resolved" {
  if (status === "unconfirmed") return "unconfirmed";
  if (status === "resolved") return "resolved";
  return "processing";
}

export function mockMutateAlert(id: number, action: MockAlertAction): boolean {
  const alert = alertState.find((a) => a.id === id);
  if (!alert) return false;

  const previous = alert.status;
  const status =
    action === "confirm" && previous === "unconfirmed" ? "confirmed" :
    action === "process" && previous === "confirmed" ? "processing" :
    action === "resolve" && previous !== "resolved" ? "resolved" :
    undefined;
  if (!status) return false;

  alert.status = status;
  alert.updated_at = new Date().toISOString();
  if (!alert.confirmed_at) {
    alert.confirmed_by = "张运维";
    alert.confirmed_at = alert.updated_at;
  }
  if (status === "resolved") {
    alert.resolved_by = "张运维";
    alert.resolved_at = alert.updated_at;
    alert.resolved_reason = "manual";
  }

  const previousBucket = alertStatBucket(previous);
  const nextBucket = alertStatBucket(status);
  if (previousBucket !== nextBucket) {
    alertStatState[previousBucket] -= 1;
    alertStatState[nextBucket] += 1;
  }
  if (status === "resolved") {
    if (alert.severity === "p0") alertStatState.critical -= 1;
    if (alert.severity === "p1") alertStatState.major -= 1;
  }
  return true;
}

const ruleDefaults: Omit<AlertRule, "id" | "name" | "metric_key" | "module" | "operator" | "threshold_warn" | "severity"> = {
  description: "", enabled: true, aggregation: "raw", threshold_crit: null,
  dual_threshold: false, target_scope: { node: "all" }, duration_type: "time",
  duration_seconds: 300, sample_count: 3, notify_email_enabled: true,
  notify_recipients: ["ops@example.com"], recovery_notify: true,
  convergence_window_seconds: 300, effective_period: null, combined_conditions: null,
  escalation: null, suppress_interval_seconds: null, silence_period: null,
  created_at: `${ALERT_DATE}T08:00:00+08:00`, updated_at: `${ALERT_DATE}T08:00:00+08:00`,
};

let alertRuleState: AlertRule[] = [
  { ...ruleDefaults, id: 101, name: "数据目录使用率告警", metric_key: "data_dir_usage", module: "system", operator: "gt", threshold_warn: 95, severity: "p0" },
  { ...ruleDefaults, id: 102, name: "deferred 队列堆积", metric_key: "queue_deferred", module: "mailflow_queue", operator: "gt", threshold_warn: 50000, severity: "p0" },
  { ...ruleDefaults, id: 103, name: "Kingbase 主从延迟", metric_key: "kb_repl_delay", module: "database", operator: "gt", threshold_warn: 60, severity: "p1" },
  { ...ruleDefaults, id: 104, name: "RBL 响应超时", metric_key: "rbl_hits", module: "detection", operator: "gt", threshold_warn: 5, severity: "p3" },
  { ...ruleDefaults, id: 105, name: "备份任务�����", metric_key: "data_dir_usage", module: "system", operator: "eq", threshold_warn: 0, severity: "p1" },
];

export function mockAlertRules(): { items: AlertRule[] } {
  return { items: alertRuleState.map((r) => ({ ...r, notify_recipients: [...r.notify_recipients] })) };
}

export function mockSaveAlertRule(payload: AlertRulePayload, id?: number): AlertRule {
  const now = new Date().toISOString();
  if (id) {
    const index = alertRuleState.findIndex((r) => r.id === id);
    const saved = { ...alertRuleState[index], ...payload, id, updated_at: now };
    if (index >= 0) alertRuleState[index] = saved;
    return saved;
  }
  const saved: AlertRule = { ...payload, id: Math.max(0, ...alertRuleState.map((r) => r.id)) + 1, created_at: now, updated_at: now };
  alertRuleState = [...alertRuleState, saved];
  return saved;
}

export function mockDeleteAlertRule(id: number): void {
  alertRuleState = alertRuleState.filter((r) => r.id !== id);
}

export const mockAlertMetrics = (): { items: MetricDef[] } => ({
  items: [
    { key: "data_dir_usage", module: "system", source: "tdengine", unit: "%", default_warn: 90, default_crit: 95, available: true, node_scoped: true },
    { key: "kb_repl_delay", module: "database", source: "dbprovider", unit: "s", default_warn: 30, default_crit: 60, available: true, node_scoped: true },
    { key: "queue_deferred", module: "mailflow_queue", source: "reldb", unit: "封", default_warn: 10000, default_crit: 50000, available: true, node_scoped: false },
    { key: "rbl_hits", module: "detection", source: "reldb", unit: "次", default_warn: 3, default_crit: 5, available: true, node_scoped: false },
  ],
});

export const mockAlertTemplates = (): { items: AlertTemplate[] } => ({
  items: alertRuleState.map((r) => ({
    key: `template-${r.id}`, name: r.name, description: r.description, module: r.module,
    metric_key: r.metric_key, aggregation: r.aggregation, operator: r.operator,
    threshold_warn: r.threshold_warn, threshold_crit: r.threshold_crit,
    dual_threshold: r.dual_threshold, duration_type: r.duration_type,
    duration_seconds: r.duration_seconds, severity: r.severity,
  })),
});

let smtpState: SmtpConfig = {
  use_internal_postfix: false, server: "smtp.example.com", port: 587,
  encryption: "starttls", auth_method: "login", username: "alert@example.com",
  password_configured: true, password_masked: "••••••••", sender_email: "alert@example.com",
  sender_name: "AI邮件安全网关", connect_timeout_seconds: 10, send_timeout_seconds: 30,
  enc_key_ready: true,
};

export const mockAlertSmtpConfig = (): SmtpConfig => ({ ...smtpState });
export function mockPutAlertSmtpConfig(payload: SmtpConfigPayload): SmtpConfig {
  smtpState = {
    ...smtpState, ...payload,
    password_configured: smtpState.password_configured || !!payload.password,
    password_masked: smtpState.password_masked || (payload.password ? "••••••••" : ""),
  };
  return mockAlertSmtpConfig();
}

// ─── 待处置邮件 / 举报待审（KPI）──────────────────────────────────────────────
// 隔离（disposal.total）：today 3 / 7d 11 / 30d 19；举报待审（inbound-audit.total）：
// today 2 / 7d 6 / 30d 13。两个查询都不带范围参数，故按模块级 currentSystemStatusRange 分支。
const DISPOSAL_PENDING: Record<SystemStatusRangeKey, number> = {
  today: 3,
  "7d": 11,
  "30d": 19,
};
const AUDIT_PENDING: Record<SystemStatusRangeKey, number> = {
  today: 2,
  "7d": 6,
  "30d": 13,
};

export function mockDisposalPendingProbe(): {
  items: unknown[];
  total: number;
  page: number;
  page_size: number;
} {
  return {
    items: [],
    total: DISPOSAL_PENDING[currentSystemStatusRange()],
    page: 1,
    page_size: 1,
  };
}

export function mockInboundAuditPending(): InboundAuditListResponse {
  return {
    items: [],
    total: AUDIT_PENDING[currentSystemStatusRange()],
    page: 1,
    page_size: 1,
  };
}

// ─── 智能体中心总览与运行概况 ────────────────────────────────────────────────
export function mockAgentCenterOverview(): AgentCenterOverview {
  return {
    agents: [
      {
        key: 'phishing',
        module_key: 'phishing_agent',
        feature_id: 'phishing-detection',
        access: 'enabled',
        status: 'running',
        stage_position: '4.0',
        policy_pages: [
          { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
          { page: 'phishing_disposition', role: 'disposition', management: 'dedicated' },
        ],
        today_processed: 12,
        hit_count: 3,
        processed_count: 12,
        hit_rate: 0.25,
      },
      {
        key: 'spoofing',
        module_key: 'spoofing_agent',
        feature_id: 'spoofing-detection',
        access: 'enabled',
        status: 'running',
        stage_position: '4.1',
        policy_pages: [
          { page: 'spoofing_admission', role: 'admission', management: 'internal' },
          { page: 'spoofing_disposition', role: 'disposition', management: 'internal' },
        ],
        today_processed: 8,
        hit_count: 2,
        processed_count: 8,
        hit_rate: 0.25,
        fallback_count: 1,
      },
      {
        key: 'threat-retro',
        module_key: 'threat_retro_agent',
        feature_id: 'threat-retro',
        access: 'enabled',
        status: 'running',
        stage_position: '4.8',
        policy_pages: [
          { page: 'threat_retro_strategy', role: 'strategy', management: 'dedicated' },
        ],
        today_processed: 30,
        hit_count: 5,
        processed_count: 30,
        hit_rate: 5 / 30,
      },
    ],
  };
}

// demo DASHBOARD_AGENTS：全部运行；今日处理量与待审数照抄。
  let phishingEngineMockState: Record<string, unknown> = {
  enabled: true,
  netdisk_domain: true,
  netdisk_extract: true,
  netdisk_spoof: true,
  run_mode: 'realtime',
  observe_action: 'deliver',
  protection_level: 'standard',
  };
  // 检测范围与准入规则（GT-12865 总开关的前置条件校验对象）。默认置空——demo
  // 首次进入时如实复现"未配置准入规则"场景，与总开关的拦截提示配套；
  // AdmissionRulesSection 本身此前在 mock 模式下无接口支撑（/phishing-agent/
  // admission-rules 未注册路由），这里一并补齐 CRUD，让该 tab 与总开关的
  // "先配置再启用"闭环都可在 mock 模式下走通。
  let phishingAdmissionRuleIdSeq = 1;
  let phishingAdmissionRulesMockState: Array<Record<string, unknown>> = [];
let phishingBandsMockState = [
  { min: 0, max: 40, disposition: 'accept' },
  { min: 40, max: 70, disposition: 'mark', mark_positions: ['subject_prefix'], mark_text: '[可疑]' },
  { min: 70, max: 90, disposition: 'quarantine' },
  { min: 90, max: 100, disposition: 'quarantine' },
];
const phishingAuditMockState: Array<Record<string, unknown>> = [];

export function mockPhishingEngineConfig() {
  return { engine: structuredClone(phishingEngineMockState), version: 1 };
}

export function mockPutPhishingEngineConfig(body: Record<string, unknown>) {
  const before = structuredClone(phishingEngineMockState);
  phishingEngineMockState = { ...phishingEngineMockState, ...(body.params as Record<string, unknown> ?? body) };
  phishingAuditMockState.unshift({
    action: 'protection_level_changed',
    changed_fields: Object.keys(phishingEngineMockState).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(phishingEngineMockState[key])),
    before,
    after: structuredClone(phishingEngineMockState),
    created_at: new Date().toISOString(),
  });
  return mockPhishingEngineConfig();
}

  export function mockPhishingAdmissionRulesList() {
  return { items: structuredClone(phishingAdmissionRulesMockState) };
  }

  export function mockCreatePhishingAdmissionRule(body: Record<string, unknown>) {
  const rule: Record<string, unknown> = {
  ...body,
  id: phishingAdmissionRuleIdSeq++,
  priority:
  typeof body.priority === 'number' ? body.priority : phishingAdmissionRulesMockState.length,
  };
  phishingAdmissionRulesMockState = [...phishingAdmissionRulesMockState, rule];
  return structuredClone(rule);
  }

  export function mockUpdatePhishingAdmissionRule(id: number, body: Record<string, unknown>) {
  const index = phishingAdmissionRulesMockState.findIndex((rule) => rule.id === id);
  if (index === -1) return null;
  const next = { ...phishingAdmissionRulesMockState[index], ...body, id };
  phishingAdmissionRulesMockState = phishingAdmissionRulesMockState.map((rule, i) =>
  i === index ? next : rule,
  );
  return structuredClone(next);
  }

  export function mockSetPhishingAdmissionRuleStatus(id: number, enabled: boolean) {
  const index = phishingAdmissionRulesMockState.findIndex((rule) => rule.id === id);
  if (index === -1) return null;
  const next = { ...phishingAdmissionRulesMockState[index], enabled };
  phishingAdmissionRulesMockState = phishingAdmissionRulesMockState.map((rule, i) =>
  i === index ? next : rule,
  );
  return structuredClone(next);
  }

  export function mockDeletePhishingAdmissionRule(id: number) {
  const before = phishingAdmissionRulesMockState.length;
  phishingAdmissionRulesMockState = phishingAdmissionRulesMockState.filter((rule) => rule.id !== id);
  return phishingAdmissionRulesMockState.length !== before;
  }

  // 附件沙箱检测规则：与准入规则同构的 CRUD mock，附带两条 demo 规则，展示
  // 高风险文件类型（可执行/宏文档）与低风险容器格式（压缩包）的典型配置差异。
  let sandboxRuleIdSeq = 3;
  let sandboxRulesMockState: Array<Record<string, unknown>> = [
    {
      id: 1,
      name: '可执行文件与宏文档送检',
      enabled: true,
      direction: ['receive'],
      sender_recipient_filter_enabled: false,
      file_type_categories: ['executable', 'macro_doc'],
      custom_extensions: [],
      risk_actions: {
        low: { action: 'audit', attachment_policy: 'mark', mark_locations: ['subject'] },
        medium: {
          action: 'quarantine',
          attachment_policy: 'mark',
          mark_locations: ['subject', 'header'],
        },
        high: { action: 'discard', attachment_policy: 'discard', mark_locations: [] },
      },
      timeout: {
        actions: ['quarantine', 'notify_admin'],
        admin_email: 'sandbox-admin@example.com',
      },
      created_at: '2026-07-01T09:00:00.000Z',
      updated_at: '2026-07-01T09:00:00.000Z',
    },
    {
      id: 2,
      name: '压缩包与脚本文件基础检测',
      enabled: true,
      direction: ['internal'],
      sender_recipient_filter_enabled: false,
      file_type_categories: ['archive', 'script'],
      custom_extensions: ['.iso'],
      risk_actions: {
        low: { action: 'audit', attachment_policy: 'mark', mark_locations: ['subject'] },
        medium: { action: 'audit', attachment_policy: 'mark', mark_locations: ['subject'] },
        high: { action: 'quarantine', attachment_policy: 'discard', mark_locations: [] },
      },
      timeout: {
        actions: ['notify_admin'],
        admin_email: 'sandbox-admin@example.com',
      },
      created_at: '2026-07-05T14:30:00.000Z',
      updated_at: '2026-07-05T14:30:00.000Z',
    },
  ];

  export function mockSandboxRulesList() {
    return { items: structuredClone(sandboxRulesMockState) };
  }

  export function mockCreateSandboxRule(body: Record<string, unknown>) {
    const now = new Date().toISOString();
    const rule: Record<string, unknown> = {
      ...body,
      id: sandboxRuleIdSeq++,
      created_at: now,
      updated_at: now,
    };
    sandboxRulesMockState = [...sandboxRulesMockState, rule];
    return structuredClone(rule);
  }

  export function mockUpdateSandboxRule(id: number, body: Record<string, unknown>) {
    const index = sandboxRulesMockState.findIndex((rule) => rule.id === id);
    if (index === -1) return null;
    const next = { ...sandboxRulesMockState[index], ...body, id, updated_at: new Date().toISOString() };
    sandboxRulesMockState = sandboxRulesMockState.map((rule, i) => (i === index ? next : rule));
    return structuredClone(next);
  }

  export function mockSetSandboxRuleStatus(id: number, enabled: boolean) {
    const index = sandboxRulesMockState.findIndex((rule) => rule.id === id);
    if (index === -1) return null;
    const next = { ...sandboxRulesMockState[index], enabled, updated_at: new Date().toISOString() };
    sandboxRulesMockState = sandboxRulesMockState.map((rule, i) => (i === index ? next : rule));
    return structuredClone(next);
  }

  export function mockDeleteSandboxRule(id: number) {
    const before = sandboxRulesMockState.length;
    sandboxRulesMockState = sandboxRulesMockState.filter((rule) => rule.id !== id);
    return sandboxRulesMockState.length !== before;
  }

  export function mockPhishingBands() {
  return { bands: structuredClone(phishingBandsMockState) };
  }

export function mockPutPhishingBands(body: { bands?: Array<Record<string, unknown>> }) {
  const before = structuredClone(phishingBandsMockState);
  phishingBandsMockState = structuredClone(body.bands ?? phishingBandsMockState) as typeof phishingBandsMockState;
  phishingAuditMockState.unshift({
    action: 'bands_changed',
    changed_fields: ['bands'],
    before,
    after: structuredClone(phishingBandsMockState),
    created_at: new Date().toISOString(),
  });
  return mockPhishingBands();
}

export function mockPhishingConfigAudit() {
  return { items: structuredClone(phishingAuditMockState) };
}

export function mockPhishingStats(): PhishingStats {
  const pendingReview = mockPhishingDetectionLogsState.filter((item) => item.disposition === 'review').length;
  const recalledCount = mockPhishingDetectionLogsState.filter((item) => item.recall_status === 'recalled').length;
  return {
    today_detected: 12450,
    today_quarantined: 12450,
    pending_review: pendingReview,
    today_recalled: recalledCount + 1,
    recall_success: recalledCount,
    accuracy: 0.978,
  };
}

// ─── 钓鱼邮件检测总览：研判日志列表 / 详情（mock）───────────────────────────
// 真实后端: GET /phishing-agent/detection-logs(/:id)、POST .../block、
// .../exempt。此前只 mock 了 /phishing-agent/stats，检测总览页的日志表格在
// �� mock ��式下始终为空（无后端时看不到任何数据）——这里补一份覆盖全部
// disposition/recall_status/risk_level/detection_mode 枚举取值的种子数据，
// 并支持列表关键字/时间范围/多选筛选分页，以及阻断/豁免对种子状态的迁移。
const PHISHING_LOG_LOADED_AT = Date.now();
function phishingHoursAgo(hours: number): string {
  return new Date(PHISHING_LOG_LOADED_AT - hours * 60 * 60 * 1000).toISOString();
}

function phishingRecipientDispositions(
  recipients: string[],
  finalAction: string,
  status: string,
  reason?: string,
): RecipientDisposition[] {
  return recipients.map((recipient) => ({
    recipient,
    original_action: 'deliver',
    final_action: finalAction,
    status,
    reason,
  }));
}

const mockPhishingDetectionLogsState: DetectionLogItem[] = [
  {
    sideline_id: 'ph-100001',
    message_id: '<8f2c1a0001@corp-outlook-mail.com>',
    sender: 'ceo.office@corp-outlook-mail.com',
    subject: 'CEO紧急付款指示，请尽快处理',
    recipients: ['finance-manager@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(0.5),
    investigation_id: 'inv-100001',
    verdict: 'phishing',
    risk_level: 'critical',
    confidence: 0.96,
    recalls: [],
    disposition_actions: ['audit_hold'],
    recipient_dispositions: phishingRecipientDispositions(
      ['finance-manager@example.com'],
      'hold',
      'pending',
      '高风险商务邮件诈骗（BEC）特征，等待人工复核',
    ),
    processed_at: phishingHoursAgo(0.45),
    disposition: 'review',
    detection_mode: 'realtime',
    // 邮件仍处于人工审核持有（hold/pending），recalls 为空、从未送达收件人，
    // 谈不上"召回"——recall_status 只对已送达过邮箱的邮件才有意义（对照
    // ph-100002/ph-100004/ph-100006 的���查叙述均明确提到"隔离并召回"）。此
    // 记录的调查步骤仅"转人工审核"，不含任何召回动作，故应为 'none'，
    // 派生的邮件状态才会正确落在「待审核」而不是「召回中」。
    recall_status: 'none',
    agent_rounds: 5,
    url_summary: { total: 4, phishing: 3, suspicious: 1, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100002',
    message_id: '<8f2c1a0002@hr-portal-secure.cn>',
    sender: 'payroll-alert@hr-portal-secure.cn',
    subject: '薪资平台安全升级，请立即验证账户',
    recipients: ['hr1@example.com', 'hr2@example.com', 'hr3@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(1.5),
    investigation_id: 'inv-100002',
    verdict: 'phishing',
    risk_level: 'critical',
    confidence: 0.98,
    recalls: [
      { receiver: 'hr1@example.com', operate_result: 'success' },
      { receiver: 'hr2@example.com', operate_result: 'success' },
      { receiver: 'hr3@example.com', operate_result: 'pending' },
    ],
    disposition_actions: ['quarantine', 'recall'],
    recipient_dispositions: [
      ...phishingRecipientDispositions(['hr1@example.com', 'hr2@example.com'], 'quarantine', 'success'),
      ...phishingRecipientDispositions(['hr3@example.com'], 'quarantine', 'pending'),
    ],
    processed_at: phishingHoursAgo(1.4),
    disposition: 'quarantine',
    detection_mode: 'realtime',
    recall_status: 'expanded',
    agent_rounds: 6,
    url_summary: { total: 5, phishing: 4, suspicious: 1, normal: 0 },
    result_truncated: true,
  },
  {
    sideline_id: 'ph-100003',
    message_id: '<8f2c1a0003@corp-passwd-reset.cn>',
    sender: 'it-support@corp-passwd-reset.cn',
    subject: '【重要】密码即将到期，请点击链接重置',
    recipients: ['hr@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(3),
    investigation_id: 'inv-100003',
    verdict: 'phishing',
    risk_level: 'high',
    confidence: 0.79,
    recalls: [],
    disposition_actions: ['audit_hold'],
    recipient_dispositions: phishingRecipientDispositions(
      ['hr@example.com'],
      'hold',
      'pending',
      '疑似钓鱼链接，等待人工复核',
    ),
    processed_at: phishingHoursAgo(2.9),
    disposition: 'review',
    detection_mode: 'realtime',
    // 同 ph-100001：调��叙述是"置信度 79%，转人工复核"，recalls 为空，从未
    // 送达收件人，不存在召回动作，recall_status 应为 'none'，使��生的邮件
    // 状态落在「待审核」而不是与执行动作矛盾的「召回中」。
    recall_status: 'none',
    agent_rounds: 4,
    url_summary: { total: 2, phishing: 1, suspicious: 0, normal: 1 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100004',
    message_id: '<8f2c1a0004@invoice-verify-service.cn>',
    sender: 'finance@invoice-verify-service.cn',
    subject: '发票红字信息表待确认（含链接）',
    recipients: ['licheng@example.com', 'wangfang@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(4),
    investigation_id: 'inv-100004',
    verdict: 'phishing',
    risk_level: 'high',
    confidence: 0.88,
    recalls: [
      { receiver: 'licheng@example.com', operate_result: 'failed' },
      { receiver: 'wangfang@example.com', operate_result: 'failed' },
    ],
    disposition_actions: ['quarantine', 'recall'],
    recipient_dispositions: phishingRecipientDispositions(
      ['licheng@example.com', 'wangfang@example.com'],
      'quarantine',
      'success',
    ),
    processed_at: phishingHoursAgo(3.9),
    disposition: 'quarantine',
    detection_mode: 'realtime',
    recall_status: 'recall_failed',
    agent_rounds: 3,
    url_summary: { total: 2, phishing: 1, suspicious: 1, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100005',
    message_id: '<8f2c1a0005@oa-portal-cn.com>',
    sender: 'security-noreply@oa-portal-cn.com',
    subject: '紧急：您的OA账号将于今日过期，请立即验证',
    recipients: ['zhangwei@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(6),
    investigation_id: 'inv-100005',
    verdict: 'phishing',
    risk_level: 'critical',
    confidence: 0.94,
    recalls: [{ receiver: 'zhangwei@example.com', operate_result: 'success' }],
    disposition_actions: ['quarantine', 'recall'],
    recipient_dispositions: phishingRecipientDispositions(['zhangwei@example.com'], 'quarantine', 'success'),
    processed_at: phishingHoursAgo(5.9),
    disposition: 'recall',
    detection_mode: 'realtime',
    recall_status: 'recalled',
    agent_rounds: 4,
    url_summary: { total: 3, phishing: 2, suspicious: 1, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100006',
    message_id: '<8f2c1a0006@bank-verify-alert.com>',
    sender: 'security@bank-verify-alert.com',
    subject: '银行账户异常登录提醒，请核实身份',
    recipients: ['accounting@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(8),
    investigation_id: 'inv-100006',
    verdict: 'phishing',
    risk_level: 'high',
    confidence: 0.85,
    recalls: [{ receiver: 'accounting@example.com', operate_result: 'success' }],
    disposition_actions: ['quarantine', 'recall'],
    recipient_dispositions: phishingRecipientDispositions(['accounting@example.com'], 'quarantine', 'success'),
    processed_at: phishingHoursAgo(7.9),
    disposition: 'quarantine',
    detection_mode: 'observe',
    recall_status: 'recalled',
    agent_rounds: 3,
    url_summary: { total: 2, phishing: 2, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100007',
    message_id: '<8f2c1a0007@drive-share-cn.net>',
    sender: 'notify@drive-share-cn.net',
    subject: '您有一份共享文档待查看',
    recipients: ['chenjing@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(9),
    investigation_id: 'inv-100007',
    verdict: 'suspicious',
    risk_level: 'medium',
    confidence: 0.62,
    recalls: [],
    disposition_actions: ['mark_subject'],
    recipient_dispositions: phishingRecipientDispositions(['chenjing@example.com'], 'mark_subject', 'success'),
    processed_at: phishingHoursAgo(8.9),
    disposition: 'deliver',
    detection_mode: 'realtime',
    recall_status: 'none',
    agent_rounds: 2,
    url_summary: { total: 1, phishing: 0, suspicious: 1, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100008',
    message_id: '<8f2c1a0008@example-internal.com>',
    sender: 'survey@example-internal.com',
    subject: '内部问���调研（限时填写）',
    recipients: ['allstaff@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(11),
    investigation_id: 'inv-100008',
    verdict: '',
    risk_level: 'medium',
    confidence: 0.55,
    recalls: [],
    disposition_actions: ['manual_hold'],
    recipient_dispositions: phishingRecipientDispositions(
      ['allstaff@example.com'],
      'hold',
      'pending',
      '需人工判定是否为内部钓鱼演练邮件',
    ),
    processed_at: phishingHoursAgo(10.9),
    disposition: 'review',
    detection_mode: 'realtime',
    recall_status: 'none',
    agent_rounds: 1,
    url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100009',
    message_id: '<8f2c1a0009@new-vendor-portal.biz>',
    sender: 'contact@new-vendor-portal.biz',
    subject: '待研判：来自新域名的邮件',
    recipients: ['procurement@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(13),
    investigation_id: 'inv-100009',
    verdict: '',
    risk_level: '',
    confidence: null,
    recalls: [],
    disposition_actions: [],
    recipient_dispositions: phishingRecipientDispositions(['procurement@example.com'], 'pending', 'pending'),
    disposition: 'review',
    detection_mode: 'realtime',
    recall_status: 'none',
    agent_rounds: 2,
    url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100010',
    message_id: '<8f2c1a0010@partner-service.com>',
    sender: 'noreply@partner-service.com',
    subject: '批量附件扫描排队中',
    recipients: ['support@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(15),
    verdict: '',
    risk_level: '',
    confidence: null,
    recalls: [],
    disposition_actions: [],
    recipient_dispositions: phishingRecipientDispositions(['support@example.com'], 'pending', 'pending'),
    disposition: 'review',
    detection_mode: '',
    recall_status: 'none',
    agent_rounds: 0,
    url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100011',
    message_id: '<8f2c1a0011@shared-drive-link.co>',
    sender: 'docs@shared-drive-link.co',
    subject: '检测失败：附件解析异常',
    recipients: ['legal@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(20),
    investigation_id: 'inv-100011',
    verdict: '',
    risk_level: '',
    confidence: null,
    recalls: [],
    disposition_actions: ['deliver'],
    recipient_dispositions: phishingRecipientDispositions(
      ['legal@example.com'],
      'deliver',
      'success',
      '研判任务失败，按默认策略放行',
    ),
    processed_at: phishingHoursAgo(19.9),
    disposition: 'deliver',
    detection_mode: 'realtime',
    recall_status: 'none',
    agent_rounds: 1,
    url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100012',
    message_id: '<8f2c1a0012@sf-express.com>',
    sender: 'logistics@sf-express.com',
    subject: '7月部门快递到付通知',
    recipients: ['opsteam@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(26),
    investigation_id: 'inv-100012',
    verdict: 'benign',
    risk_level: 'low',
    confidence: 0.18,
    recalls: [],
    disposition_actions: ['deliver'],
    recipient_dispositions: phishingRecipientDispositions(['opsteam@example.com'], 'deliver', 'success'),
    processed_at: phishingHoursAgo(25.9),
    disposition: 'deliver',
    detection_mode: 'observe',
    recall_status: 'none',
    agent_rounds: 1,
    url_summary: { total: 1, phishing: 0, suspicious: 0, normal: 1 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100013',
    message_id: '<8f2c1a0013@example.com>',
    sender: 'pm@example.com',
    subject: '周报提交提醒',
    recipients: ['team@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(48),
    investigation_id: 'inv-100013',
    verdict: 'benign',
    risk_level: 'none',
    confidence: 0.09,
    recalls: [],
    disposition_actions: ['deliver'],
    recipient_dispositions: phishingRecipientDispositions(['team@example.com'], 'deliver', 'success'),
    processed_at: phishingHoursAgo(47.9),
    disposition: 'deliver',
    detection_mode: 'observe',
    recall_status: 'none',
    agent_rounds: 1,
    url_summary: { total: 2, phishing: 0, suspicious: 0, normal: 2 },
    result_truncated: false,
  },
  {
    sideline_id: 'ph-100014',
    message_id: '<8f2c1a0014@legacy-relay.net>',
    sender: 'unknown@legacy-relay.net',
    subject: '（主题解析异常）',
    recipients: ['archive@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: phishingHoursAgo(90),
    verdict: '',
    risk_level: 'none',
    confidence: null,
    recalls: [],
    disposition_actions: [],
    recipient_dispositions: phishingRecipientDispositions(['archive@example.com'], 'unknown', 'unknown'),
    disposition: 'drop',
    detection_mode: '',
    recall_status: 'none',
    agent_rounds: 0,
    url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  },
];

// 研判详情：仅有 investigation_id 的行才有对应记录，与摘要行的 sideline_id 对齐。
const mockPhishingInvestigations: Record<string, InvestigationTask> = {
  'ph-100001': {
    id: 'inv-100001',
    summary: '邮件冒充公司 CEO 要求财务人员紧急转账，发件域名与真实域名高度相似（同形字替换），命中 BEC 诈骗特征库。',
    status: 'completed',
    risk_level: 'critical',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'sender_domain_check', status: 'completed', message: '发件域名 corp-outlook-mail.com 非公司备案域名，命中相似域名规则' },
      { name: 'llm_verdict', status: 'completed', message: '文本要素判定为商务邮件诈骗（BEC），置信度 96%' },
      { name: 'dispatch_action', status: 'completed', message: '转人工审核（audit_hold）' },
    ],
    result: {
      verdict: 'phishing',
      summary: '典型 CEO 冒充诈骗，要求非常规紧急转账，建议直接拦截并提醒财务核实。',
      confidence: 0.96,
      evidence: [
        { type: 'sender_domain', severity: 'critical', title: '发件域名疑似仿冒', detail: 'corp-outlook-mail.com 与公司真实域名视觉高度相似' },
        { type: 'content', severity: 'high', title: '异常转账指令', detail: '邮件正文要求跳过正常审批流程紧急付款' },
      ],
      details: {
        url_findings: [
          { url: 'https://corp-outlook-mail.com/verify-payment', final_url: 'https://pay-confirm-secure.cn/form', risk_level: 'critical', agent: { verdict: 'phishing', risk_level: 'critical' } },
          { url: 'https://corp-outlook-mail.com/invoice.pdf', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://corp-outlook-mail.com/contract', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://corp-outlook-mail.com/help', risk_level: 'medium', agent: { verdict: 'suspicious', risk_level: 'medium' } },
        ],
      },
    },
  },
  'ph-100002': {
    id: 'inv-100002',
    summary: '仿冒 HR 薪资平台的批量钓鱼邮件，页面高度复刻真实登录页，诱导输入账号密码。',
    status: 'completed',
    risk_level: 'critical',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed', message: '提取到 5 个链接' },
      { name: 'sandbox_render', status: 'completed', message: '沙箱渲染命中仿冒登录页特征' },
      { name: 'llm_verdict', status: 'completed' },
      { name: 'dispatch_action', status: 'completed', message: '隔离并触发批量召回' },
    ],
    result: {
      verdict: 'phishing',
      summary: '批量投递的仿冒薪资平台钓鱼邮件，已隔离并对 3 位收件人发起召回。',
      confidence: 0.98,
      evidence: [
        { type: 'page_clone', severity: 'critical', title: '仿冒登录页', detail: '落地页与 HR 门户登录页像素级一致，域名为新注册域名' },
        { type: 'batch_delivery', severity: 'high', title: '批量投递', detail: '同一发件人在短时间内向多个 HR 相关邮箱投递' },
      ],
      details: {
        url_findings: [
          { url: 'https://hr-portal-secure.cn/login', final_url: 'https://hr-portal-secure.cn/collect', risk_level: 'critical', agent: { verdict: 'phishing', risk_level: 'critical' } },
          { url: 'https://hr-portal-secure.cn/verify', risk_level: 'critical', agent: { verdict: 'phishing', risk_level: 'critical' } },
          { url: 'https://hr-portal-secure.cn/sso', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://hr-portal-secure.cn/policy', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://hr-portal-secure.cn/faq', risk_level: 'medium', agent: { verdict: 'suspicious', risk_level: 'medium' } },
        ],
      },
    },
  },
  'ph-100003': {
    id: 'inv-100003',
    summary: '仿冒 IT 部门的密码到期提醒，诱导点击重置链接，链接落地页与公司 SSO 页面相似。',
    status: 'completed',
    risk_level: 'high',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed' },
      { name: 'sandbox_render', status: 'completed' },
      { name: 'llm_verdict', status: 'completed', message: '置信度 79%，转人工复核' },
    ],
    result: {
      verdict: 'phishing',
      summary: '疑似密码重置钓鱼，建议人工复核后决定是否拦截。',
      confidence: 0.79,
      evidence: [
        { type: 'page_clone', severity: 'high', title: '仿冒 SSO 页面', detail: '落地页表单结构与公司 SSO 页面相似' },
      ],
      details: {
        url_findings: [
          { url: 'https://corp-passwd-reset.cn/reset', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://corp-passwd-reset.cn/help', risk_level: 'low', agent: { verdict: 'benign', risk_level: 'low' } },
        ],
      },
    },
  },
  'ph-100004': {
    id: 'inv-100004',
    summary: '仿冒发票红字信息表通知，附带链接诱导下载"确认文件"，实为钓鱼落地页。',
    status: 'completed',
    risk_level: 'high',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed' },
      { name: 'llm_verdict', status: 'completed' },
      { name: 'dispatch_action', status: 'completed', message: '隔离并尝试召回，2 位收件人均已读取，召回失败' },
    ],
    result: {
      verdict: 'phishing',
      summary: '财务类钓鱼邮件，2 位收件人在拦截前已读取邮件，召回未成功，建议人工提醒。',
      confidence: 0.88,
      evidence: [
        { type: 'content', severity: 'high', title: '财务话术诱导', detail: '正文以"红字发票""待确认"制造紧迫感' },
      ],
      details: {
        url_findings: [
          { url: 'https://invoice-verify-service.cn/confirm', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://invoice-verify-service.cn/track', risk_level: 'medium', agent: { verdict: 'suspicious', risk_level: 'medium' } },
        ],
      },
    },
  },
  'ph-100005': {
    id: 'inv-100005',
    summary: '仿冒 OA 门户账号过期通知，域名与公司 OA 域名相似，落地页收集账号密码。',
    status: 'completed',
    risk_level: 'critical',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed' },
      { name: 'sandbox_render', status: 'completed' },
      { name: 'llm_verdict', status: 'completed' },
      { name: 'dispatch_action', status: 'completed', message: '隔离并成功召回' },
    ],
    result: {
      verdict: 'phishing',
      summary: '仿冒 OA 登录钓鱼邮件，已隔离并成功召回，收件人未点击链接。',
      confidence: 0.94,
      evidence: [
        { type: 'sender_domain', severity: 'critical', title: '仿冒域名', detail: 'oa-portal-cn.com 非公司备案域名' },
      ],
      details: {
        url_findings: [
          { url: 'https://oa-portal-cn.com/login', risk_level: 'critical', agent: { verdict: 'phishing', risk_level: 'critical' } },
          { url: 'https://oa-portal-cn.com/verify', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://oa-portal-cn.com/help', risk_level: 'medium', agent: { verdict: 'suspicious', risk_level: 'medium' } },
        ],
      },
    },
  },
  'ph-100006': {
    id: 'inv-100006',
    summary: '仿冒银行安全提醒，诱导核实身份并输入网银账号密码，属旁路观察模式下的抽样检测。',
    status: 'completed',
    risk_level: 'high',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed' },
      { name: 'llm_verdict', status: 'completed' },
      { name: 'dispatch_action', status: 'completed', message: '观察模式命中高风险，升级为隔离并召回' },
    ],
    result: {
      verdict: 'phishing',
      summary: '仿冒银行安全提醒钓鱼邮件，已隔离并成功召回。',
      confidence: 0.85,
      evidence: [
        { type: 'page_clone', severity: 'high', title: '仿冒网银登录页', detail: '落地页表单字段与真实网银登录页一致' },
      ],
      details: {
        url_findings: [
          { url: 'https://bank-verify-alert.com/secure-login', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
          { url: 'https://bank-verify-alert.com/otp', risk_level: 'high', agent: { verdict: 'phishing', risk_level: 'high' } },
        ],
      },
    },
  },
  'ph-100007': {
    id: 'inv-100007',
    summary: '"共享文档"通知邮件，链接跳转至非常见网盘域名，暂无法确认恶意，标记为可疑。',
    status: 'completed',
    risk_level: 'medium',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed' },
      { name: 'llm_verdict', status: 'completed', message: '置信度 62%，标记但不拦截' },
    ],
    result: {
      verdict: 'suspicious',
      summary: '链接域名注册时间较短且非常见网盘服务，建议提醒用户谨慎点击。',
      confidence: 0.62,
      evidence: [
        { type: 'domain_age', severity: 'medium', title: '新注册域名', detail: '域名注册时间不足 30 天' },
      ],
      details: {
        url_findings: [
          { url: 'https://drive-share-cn.net/s/8fk2', risk_level: 'medium', agent: { verdict: 'suspicious', risk_level: 'medium' } },
        ],
      },
    },
  },
  'ph-100008': {
    id: 'inv-100008',
    summary: '内部问卷调研邮件不含外链，但发件域名与内部标准域名不完全一致，转人工判定。',
    status: 'completed',
    risk_level: 'medium',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'sender_domain_check', status: 'completed', message: 'example-internal.com 非白名单内部域名' },
      { name: 'dispatch_action', status: 'completed', message: '转人工判定是否为钓鱼演练' },
    ],
    result: {
      verdict: '',
      summary: '无外链、无明显恶意特征，但发件域名存疑，建议人工确认是否为安全演练���件。',
      confidence: 0.55,
      evidence: [],
    },
  },
  'ph-100009': {
    id: 'inv-100009',
    summary: '',
    status: 'running',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'sender_domain_check', status: 'completed', message: '新域名 new-vendor-portal.biz，30 天内首次��信' },
      { name: 'llm_verdict', status: 'running' },
    ],
    result: undefined,
  },
  'ph-100011': {
    id: 'inv-100011',
    summary: '',
    status: 'failed',
    error_message: '附件解析超��（压缩包嵌套层数超限），研判任务失败，按默认策略放行并记录',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_attachments', status: 'failed', message: '解压嵌套压缩包超时' },
    ],
  },
  'ph-100012': {
    id: 'inv-100012',
    summary: '快递���付通知，链接指向顺丰官方域名，无风险特征。',
    status: 'completed',
    risk_level: 'low',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'extract_urls', status: 'completed' },
      { name: 'llm_verdict', status: 'completed' },
    ],
    result: {
      verdict: 'benign',
      summary: '链接域名为已知可信物流服务商，正常放行。',
      confidence: 0.18,
      evidence: [],
      details: {
        url_findings: [
          { url: 'https://www.sf-express.com/track', risk_level: 'low', agent: { verdict: 'benign', risk_level: 'low' } },
        ],
      },
    },
  },
  'ph-100013': {
    id: 'inv-100013',
    summary: '常规周报提交提醒，内部发件人，无风险特征。',
    status: 'completed',
    risk_level: 'none',
    steps: [
      { name: 'fetch_mail', status: 'completed' },
      { name: 'llm_verdict', status: 'completed' },
    ],
    result: {
      verdict: 'benign',
      summary: '内部常规通知邮件，正常放行。',
      confidence: 0.09,
      evidence: [],
      details: {
        url_findings: [
          { url: 'https://intranet.example.com/weekly', risk_level: 'low', agent: { verdict: 'benign', risk_level: 'low' } },
          { url: 'https://intranet.example.com/template', risk_level: 'low', agent: { verdict: 'benign', risk_level: 'low' } },
        ],
      },
    },
  },
};

function mockPhishingLogMatchesQuery(item: DetectionLogItem, query: URLSearchParams): boolean {
  const keyword = query.get('keyword');
  if (keyword) {
    const needle = keyword.toLowerCase();
    const haystack = `${item.sender} ${item.subject} ${item.recipients.join(' ')}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  const start = query.get('start');
  const end = query.get('end');
  const sidelinedAt = Date.parse(item.sidelined_at);
  if (start && sidelinedAt < Date.parse(start)) return false;
  if (end && sidelinedAt > Date.parse(end)) return false;
  const dispositions = query.getAll('disposition');
  if (dispositions.length > 0 && !dispositions.includes(item.disposition)) return false;
  const modes = query.getAll('detection_mode');
  if (modes.length > 0 && !modes.includes(item.detection_mode)) return false;
  const riskLevels = query.getAll('risk_level');
  if (riskLevels.length > 0 && !riskLevels.includes(item.risk_level ?? '')) return false;
  // 「邮件状态」筛选：真实后端接口没有对应查询参数，Mock 模式下按与表格列
  // 完全一致的派生规则（disposition + recall_status → DisplayStatus）计算
  // 后再比对，保证多选之间是 OR 语义（选中任一状态即命中）。
  const mailStatuses = query.getAll('mail_status');
  if (mailStatuses.length > 0) {
    const derived = item.display_status ?? mapPhishingDispositionToDisplayStatus(item.disposition, item.recall_status);
    if (!mailStatuses.includes(derived)) return false;
  }
  return true;
}

  export function mockPhishingDetectionLogsList(path: string): DetectionLogListResponse {
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  const filtered = mockPhishingDetectionLogsState.map((item) => ({
    ...item,
    display_status: item.display_status ?? mapPhishingDispositionToDisplayStatus(item.disposition, item.recall_status),
  })).filter((item) => mockPhishingLogMatchesQuery(item, query))
    .filter((item) => mockPhishingLogMatchesQuery(item, query))
    .sort((a, b) => Date.parse(b.sidelined_at) - Date.parse(a.sidelined_at));
  const page = Math.max(1, Number(query.get('page') ?? 1));
  const pageSize = Math.max(1, Number(query.get('page_size') ?? 20));
  return {
    items: structuredClone(filtered.slice((page - 1) * pageSize, page * pageSize)),
    total: filtered.length,
    page,
    page_size: pageSize,
  };
}

export function mockPhishingDetectionLogDetail(id: string): DetectionLogDetail | null {
  const summary = mockPhishingDetectionLogsState.find((item) => item.sideline_id === id);
  if (!summary) return null;
  const investigation = mockPhishingInvestigations[id] ?? {};
  return {
    summary: structuredClone(summary),
    investigation: structuredClone(investigation),
    config_snapshot: null,
  };
}

export function mockPhishingBlockDetection(id: string): BlockResponse {
  const item = mockPhishingDetectionLogsState.find((entry) => entry.sideline_id === id);
  if (!item) return { status: 'blocked' };
  if (item.disposition === 'quarantine') return { status: 'already_blocked' };
  item.disposition = 'quarantine' as Disposition;
  item.recall_status = item.recipients.length > 0 ? 'pending_recall' : item.recall_status;
  if (!item.disposition_actions.includes('quarantine')) item.disposition_actions = [...item.disposition_actions, 'quarantine'];
  item.processed_at = new Date().toISOString();
  return { status: 'blocked' };
}

export function mockPhishingExemptDetection(id: string): ExemptResponse {
  const item = mockPhishingDetectionLogsState.find((entry) => entry.sideline_id === id);
  if (item) {
    item.disposition = 'deliver' as Disposition;
    if (!item.disposition_actions.includes('deliver')) item.disposition_actions = [...item.disposition_actions, 'deliver'];
    item.processed_at = new Date().toISOString();
  }
  return { status: 'exempted' };
}

export function mockSpoofingStats(): SpoofingStats {
  return {
    today_detected: 8650,
    today_intercepted: 8650,
    pending_review: 0,
    displayname_hits: 0,
    brand_hits: 0,
  };
}

export function mockThreatRetroStats(): ThreatRetroStats {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    snapshot: { in_progress: 0, pending_recall: 0 },
    range: {
      start: start.toISOString(),
      end: now.toISOString(),
      scanned_count: 0,
      leaks_found: 0,
      recall_succeeded: 326,
      recall_failed: 0,
      detection_rate: null,
    },
  };
}

// ─── 系统与服务健康（新端点 GET /system/health-summary）──────────────────────
// demo SYSTEM_HEALTH，snake_case 字段（组件将按此形状消费）。
export function mockSystemHealthSummary(): {
  license_days: number;
  rule_version: string;
  rule_latest: boolean;
  av_vendor: string;
  av_expire: string;
} {
  return {
    license_days: 69,
    rule_version: "202604021122",
    rule_latest: true,
    av_vendor: "ClamAV",
    av_expire: "2026-07-01",
  };
}

// ─── IP 频率限制（对齐 demo `mock-data.ts`）─────────────────────────────────
//
// 数据结构对齐 webapp `IPFrequencyRuleView`（webapp/src/types/ip-frequency.ts）：
//   - 顶层包含 `Rule`（id/name/priority/is_active/...）+ 字段大写开���限值列
//     (DailyConnectionLimit / WindowMinutes / ...) + SuspendMinutes 等
//   - ScopeType: 'all' | 'single' | 'range'
//   - SuspendMinutes: number（demo 用 '15min'/'1hour'/'none' 字符串，这里转成分钟数）
//   - Rule.action: 'reject' | 'tempfail' | 'disconnect'（webapp IPFrequencyAction enum）

const SUSPEND_MIN_MAP: Record<string, number> = {
  none: 0,
  "15min": 15,
  "30min": 30,
  "1hour": 60,
  "2hour": 120,
  "6hour": 360,
  "24hour": 1440,
};

const ACTION_MAP: Record<string, string> = {
  reject: "reject",
  error421: "tempfail",
  disconnect: "disconnect",
  delay: "disconnect",
};

function makeRule(input: {
  id: number;
  name: string;
  description?: string;
  priority: number;
  scopeType: "all" | "single" | "range" | "ipGroup";
  scopeValue: string;
  validUntil?: string;
  dailyLimit: number;
  concurrentLimit: number;
  windowMinutes: number;
  windowConnectionLimit: number;
  hourlyAuthFailureLimit: number;
  singleConnectionCommandErrorLimit: number;
  singleConnectionAuthFailureLimit: number;
  blockAction: "reject" | "error421" | "disconnect" | "delay";
  suspendDuration: keyof typeof SUSPEND_MIN_MAP;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}): IPFrequencyRuleView {
  const validUntil = input.validUntil || null;
  return {
    Rule: {
      id: input.id,
      name: input.name,
      description: input.description ?? "",
      priority: input.priority,
      action: ACTION_MAP[input.blockAction] ?? "reject",
      is_active: input.enabled,
      valid_from: null,
      valid_until: validUntil,
      created_at: input.createdAt,
      updated_at: input.updatedAt ?? input.createdAt,
    },
    ScopeType: input.scopeType,
    ScopeValue: input.scopeValue,
    DailyConnectionLimit: input.dailyLimit,
    ConcurrentConnectionLimit: input.concurrentLimit,
    WindowMinutes: input.windowMinutes,
    WindowConnectionLimit: input.windowConnectionLimit,
    HourlyAuthFailureLimit: input.hourlyAuthFailureLimit,
    SingleConnectionCommandErrorLimit: input.singleConnectionCommandErrorLimit,
    SingleConnectionAuthFailureLimit: input.singleConnectionAuthFailureLimit,
    SuspendMinutes: SUSPEND_MIN_MAP[input.suspendDuration] ?? 0,
    TempfailMessage: "",
    IsExpired: validUntil ? new Date(validUntil) < new Date() : false,
  };
}

// 与 demo `generateMockRules` 对齐：5 条手工 + 15 条自动生成，共 20 条
// （demo 总数 55，但只展示 20 条/页；前 5 条手工的与 demo 完全一致）
function makeMockIPFrequencyRules(): IPFrequencyRuleView[] {
  const base = [
    makeRule({
      id: 1,
      name: "高频发信限制",
      description: "合作伙伴IP，放宽限制",
      priority: 100,
      scopeType: "range",
      scopeValue: "203.0.113.0/24",
      dailyLimit: 5000,
      concurrentLimit: 50,
      windowMinutes: 15,
      windowConnectionLimit: 1000,
      hourlyAuthFailureLimit: 20,
      singleConnectionCommandErrorLimit: -1,
      singleConnectionAuthFailureLimit: 3,
      blockAction: "reject",
      suspendDuration: "30min",
      enabled: true,
      createdAt: "2024-01-15T10:30:00Z",
    }),
    makeRule({
      id: 2,
      name: "可信IP组放宽限制",
      description: "对可信IP组放宽频率限制",
      priority: 50,
      scopeType: "ipGroup",
      scopeValue: "ip-1",
      dailyLimit: 10000,
      concurrentLimit: 100,
      windowMinutes: 15,
      windowConnectionLimit: 2000,
      hourlyAuthFailureLimit: 50,
      singleConnectionCommandErrorLimit: -1,
      singleConnectionAuthFailureLimit: 5,
      blockAction: "reject",
      suspendDuration: "none",
      enabled: true,
      createdAt: "2024-01-16T08:00:00Z",
    }),
    makeRule({
      id: 3,
      name: "可疑IP严格限制",
      description: "临时限制，观察中",
      priority: 200,
      scopeType: "range",
      scopeValue: "198.51.100.0/24",
      validUntil: "2026-06-30",
      dailyLimit: 200,
      concurrentLimit: 5,
      windowMinutes: 15,
      windowConnectionLimit: 50,
      hourlyAuthFailureLimit: 5,
      singleConnectionCommandErrorLimit: 10,
      singleConnectionAuthFailureLimit: 2,
      blockAction: "error421",
      suspendDuration: "1hour",
      enabled: true,
      createdAt: "2024-01-14T16:20:00Z",
    }),
    makeRule({
      id: 4,
      name: "默认频率规则",
      priority: 300,
      scopeType: "range",
      scopeValue: "10.0.0.0/8",
      dailyLimit: 2000,
      concurrentLimit: -1,
      windowMinutes: 15,
      windowConnectionLimit: 500,
      hourlyAuthFailureLimit: 10,
      singleConnectionCommandErrorLimit: -1,
      singleConnectionAuthFailureLimit: 3,
      blockAction: "reject",
      suspendDuration: "none",
      enabled: false,
      createdAt: "2024-01-13T09:15:00Z",
    }),
    makeRule({
      id: 5,
      name: "VPN出口IP监控",
      description: "公司VPN出口IP，仅记录不阻断",
      priority: 50,
      scopeType: "single",
      scopeValue: "172.16.100.1",
      dailyLimit: -1,
      concurrentLimit: 100,
      windowMinutes: 15,
      windowConnectionLimit: -1,
      hourlyAuthFailureLimit: -1,
      singleConnectionCommandErrorLimit: -1,
      singleConnectionAuthFailureLimit: 5,
      blockAction: "disconnect",
      suspendDuration: "15min",
      enabled: true,
      createdAt: "2024-01-10T08:00:00Z",
      updatedAt: "2024-01-12T14:30:00Z",
    }),
  ];

  // 51 条自动生成（i=6..56），与 demo `generateMockRules`（i=5..55，共 56 条）对齐总数，
  // 供分页演示（10/20/50/100 每页）。
  const names = [
    "办公区IP限制",
    "数据中心监控",
    "CDN节点规则",
    "云主机频率控制",
    "移动端接入限制",
    "API网关规则",
    "邮件服务器监控",
    "内网交换机",
    "防火墙出口",
    "负载均衡器",
    "测试环境限制",
    "生产环境严格",
    "备份服务器",
    "日志收集器",
    "监控系统",
  ];
  const scopes: Array<"single" | "range" | "all"> = ["single", "range", "all"];
  const blockActions = ["reject", "error421", "disconnect", "delay"] as const;
  const suspends = [
    "none",
    "15min",
    "30min",
    "1hour",
    "6hour",
    "24hour",
  ] as const;

  for (let i = 6; i <= 56; i++) {
    const idx = i - 6;
    const octet1 = 10 + Math.floor(idx / 256);
    const octet2 = idx % 256;
    const scope = scopes[idx % 3];
    base.push(
      makeRule({
        id: i,
        name: `${names[idx % names.length]}_${i}`,
        description: i % 3 === 0 ? `自动生成的测试规则 #${i}` : "",
        priority: i * 10,
        scopeType: scope,
        scopeValue:
          scope === "all"
            ? ""
            : scope === "single"
              ? `192.168.${octet1}.${octet2}`
              : `192.168.${octet1}.0/24`,
        validUntil: i % 5 === 0 ? "2026-12-31" : undefined,
        dailyLimit: 1000 + i * 100,
        concurrentLimit: i % 4 === 0 ? -1 : 10 + i,
        windowMinutes: 15,
        windowConnectionLimit: 100 + i * 10,
        hourlyAuthFailureLimit: i % 3 === 0 ? -1 : 5 + (i % 10),
        singleConnectionCommandErrorLimit: i % 2 === 0 ? -1 : 20,
        singleConnectionAuthFailureLimit: 3,
        blockAction: blockActions[idx % 4],
        suspendDuration: suspends[idx % 6],
        enabled: i % 7 !== 0,
        createdAt: `2024-0${1 + (idx % 9)}-${10 + (idx % 20)}T08:00:00Z`,
      }),
    );
  }
  return base;
}

// 有状态内存 store：Mock 模式下 create/update/delete/toggle/import/release 真实生效
// （对齐 demo 的内存行为），让写操作后重新拉取能看到变化。原地 mutate 保持数组引用稳定。
export const mockIPFrequencyRules: IPFrequencyRuleView[] =
  makeMockIPFrequencyRules();

// 挂起 IP（镜像 demo `mock-data.ts` mockSuspendedIps，7 条）。
// demo ruleId "1"（高频发信限制）→ webapp id 1（5 条）；demo "4"（VPN出口IP监控）→ webapp id 5（2 条）。
export const mockSuspendedIPs: SuspendedIP[] = [
  {
    ip: "203.0.113.55",
    rule_id: 1,
    rule_name: "高频发信限制",
    action: "reject",
    suspended_at: "2024-01-15T17:05:00Z",
    expires_at: "2024-01-15T17:35:00Z",
    reason: "15分钟连接数超过1000次",
  },
  {
    ip: "203.0.113.88",
    rule_id: 1,
    rule_name: "高频发信限制",
    action: "reject",
    suspended_at: "2024-01-15T17:10:00Z",
    expires_at: "2024-01-15T17:40:00Z",
    reason: "认证失败超过20次/小时",
  },
  {
    ip: "203.0.113.120",
    rule_id: 1,
    rule_name: "高频发信限制",
    action: "reject",
    suspended_at: "2024-01-15T16:50:00Z",
    expires_at: "2024-01-15T17:20:00Z",
    reason: "并发连接超过50",
  },
  {
    ip: "203.0.113.200",
    rule_id: 1,
    rule_name: "高频发信限制",
    action: "reject",
    suspended_at: "2024-01-15T17:00:00Z",
    expires_at: "2024-01-15T17:30:00Z",
    reason: "���日连接数超过5000",
  },
  {
    ip: "203.0.113.15",
    rule_id: 1,
    rule_name: "高频发信限制",
    action: "reject",
    suspended_at: "2024-01-15T17:12:00Z",
    expires_at: "2024-01-15T17:42:00Z",
    reason: "单连接认证失败超过3次",
  },
  {
    ip: "172.16.100.1",
    rule_id: 5,
    rule_name: "VPN出口IP监控",
    action: "disconnect",
    suspended_at: "2024-01-15T16:45:00Z",
    expires_at: "2024-01-15T17:00:00Z",
    reason: "并发连接超过100",
  },
  {
    ip: "172.16.100.2",
    rule_id: 5,
    rule_name: "VPN出口IP监控",
    action: "disconnect",
    suspended_at: "2024-01-15T16:55:00Z",
    expires_at: "2024-01-15T17:10:00Z",
    reason: "单连接认证失败超过5次",
  },
];

let nextIPFrequencyId =
  mockIPFrequencyRules.reduce((m, r) => Math.max(m, r.Rule.id), 0) + 1;

// 把写请求 payload（snake_case 扁平）转成读视图 `IPFrequencyRuleView`。
function ipFrequencyPayloadToView(
  payload: IPFrequencyRulePayload,
  id: number,
  createdAt?: string,
): IPFrequencyRuleView {
  const now = new Date().toISOString();
  const validUntil = payload.valid_until || null;
  return {
    Rule: {
      id,
      name: payload.name,
      description: payload.description ?? "",
      priority: payload.priority,
      action: payload.action,
      is_active: payload.is_active ?? true,
      valid_from: payload.valid_from || null,
      valid_until: validUntil,
      created_at: createdAt ?? now,
      updated_at: now,
    },
    ScopeType: payload.scope_type,
    ScopeValue: payload.scope_value ?? "",
    DailyConnectionLimit: payload.daily_connection_limit,
    ConcurrentConnectionLimit: payload.concurrent_connection_limit,
    WindowMinutes: payload.window_minutes,
    WindowConnectionLimit: payload.window_connection_limit,
    HourlyAuthFailureLimit: payload.hourly_auth_failure_limit,
    SingleConnectionCommandErrorLimit:
      payload.single_connection_command_error_limit,
    SingleConnectionAuthFailureLimit:
      payload.single_connection_auth_failure_limit,
    SuspendMinutes: payload.suspend_minutes,
    TempfailMessage: payload.tempfail_message ?? "",
    IsExpired: validUntil ? new Date(validUntil) < new Date() : false,
  };
}

export function mockIPFrequencyRulesList(query: {
  page?: number;
  page_size?: number;
  q?: string;
  scope_type?: string;
  is_active?: boolean;
}) {
  let items = [...mockIPFrequencyRules];
  if (query.scope_type) {
    items = items.filter((r) => r.ScopeType === query.scope_type);
  }
  if (query.is_active !== undefined) {
    items = items.filter((r) => r.Rule.is_active === query.is_active);
  }
  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter(
      (r) =>
        String(r.Rule.id).includes(q) ||
        r.Rule.name.toLowerCase().includes(q) ||
        r.ScopeValue.toLowerCase().includes(q),
    );
  }
  const total = items.length;
  const page = query.page || 1;
  const pageSize = query.page_size || 20;
  // IPFrequencyPage 用 page_size=10000 一次拉全，所以不切分；如果要切：
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: items.slice(start, end),
    total,
    page,
    page_size: pageSize,
  };
}

export function mockGetIPFrequencyRule(
  id: number,
): IPFrequencyRuleView | undefined {
  return mockIPFrequencyRules.find((r) => r.Rule.id === id);
}

export function mockCreateIPFrequencyRule(
  payload: IPFrequencyRulePayload,
): IPFrequencyRuleView {
  const view = ipFrequencyPayloadToView(payload, nextIPFrequencyId++);
  mockIPFrequencyRules.push(view);
  return view;
}

export function mockUpdateIPFrequencyRule(
  id: number,
  payload: IPFrequencyRulePayload,
): IPFrequencyRuleView | undefined {
  const idx = mockIPFrequencyRules.findIndex((r) => r.Rule.id === id);
  if (idx === -1) return undefined;
  const view = ipFrequencyPayloadToView(
    payload,
    id,
    mockIPFrequencyRules[idx].Rule.created_at,
  );
  mockIPFrequencyRules[idx] = view;
  return view;
}

export function mockDeleteIPFrequencyRule(
  id: number,
  releaseSuspended = false,
): void {
  const idx = mockIPFrequencyRules.findIndex((r) => r.Rule.id === id);
  if (idx !== -1) mockIPFrequencyRules.splice(idx, 1);
  if (releaseSuspended) {
    for (let i = mockSuspendedIPs.length - 1; i >= 0; i--) {
      if (mockSuspendedIPs[i].rule_id === id) mockSuspendedIPs.splice(i, 1);
    }
  }
}

export function mockSetIPFrequencyRuleStatus(
  id: number,
  isActive: boolean,
): { id: number; is_active: boolean } {
  const rule = mockIPFrequencyRules.find((r) => r.Rule.id === id);
  if (rule) rule.Rule.is_active = isActive;
  return { id, is_active: isActive };
}

export function mockBulkIPFrequencyRules(body: {
  action: "delete" | "toggle";
  ids: number[];
  is_active?: boolean;
}): { action: string; ids: number[]; count: number } {
  const ids = body.ids || [];
  if (body.action === "delete") {
    for (let i = mockIPFrequencyRules.length - 1; i >= 0; i--) {
      if (ids.includes(mockIPFrequencyRules[i].Rule.id))
        mockIPFrequencyRules.splice(i, 1);
    }
  } else if (body.action === "toggle") {
    for (const r of mockIPFrequencyRules) {
      if (ids.includes(r.Rule.id))
        r.Rule.is_active = body.is_active ?? !r.Rule.is_active;
    }
  }
  return { action: body.action, ids, count: ids.length };
}

export function mockExportIPFrequencyRules(): {
  version: string;
  exported_at: string;
  rules: IPFrequencyRuleView[];
} {
  return {
    version: "1.0",
    exported_at: new Date().toISOString(),
    rules: [...mockIPFrequencyRules],
  };
}

export function mockImportIPFrequencyRules(body: {
  rules: IPFrequencyRulePayload[];
}): { imported: number; errors: string[]; total: number } {
  const rules = body.rules || [];
  let imported = 0;
  const errors: string[] = [];
  for (const p of rules) {
    if (!p || !p.name) {
      errors.push("规则名称不能为空");
      continue;
    }
    mockCreateIPFrequencyRule(p);
    imported++;
  }
  return { imported, errors, total: rules.length };
}

export function mockTestIPFrequency(body: {
  test_ip: string;
  action: string;
}): IPFrequencyTestResponse {
  // 无真实流量：以当前挂起列表判定该 IP 是否已被限制，给出可见的测试结���。
  const hit = mockSuspendedIPs.find((s) => s.ip === body.test_ip);
  if (hit) {
    return {
      blocked: true,
      action: hit.action,
      product_action: hit.action,
      reason: hit.reason,
    };
  }
  return {
    blocked: false,
    action: body.action || "reject",
    product_action: body.action || "reject",
    reason: "该IP当前未触发任何频率限制阈值",
  };
}

export function mockRuleSuspendedIPs(ruleId: number): {
  suspensions: SuspendedIP[];
} {
  return { suspensions: mockSuspendedIPs.filter((s) => s.rule_id === ruleId) };
}

export function mockSuspendedIPsList(): { suspensions: SuspendedIP[] } {
  return { suspensions: [...mockSuspendedIPs] };
}

export function mockReleaseSuspendedIP(ip: string): { released: string } {
  const idx = mockSuspendedIPs.findIndex((s) => s.ip === ip);
  if (idx !== -1) mockSuspendedIPs.splice(idx, 1);
  return { released: ip };
}

export function mockBulkReleaseSuspendedIPs(body: {
  ips?: string[];
  rule_id?: number;
  all?: boolean;
}): { released: number } {
  let released = 0;
  for (let i = mockSuspendedIPs.length - 1; i >= 0; i--) {
    const s = mockSuspendedIPs[i];
    const match =
      body.all === true ||
      (body.ips ? body.ips.includes(s.ip) : false) ||
      (body.rule_id !== undefined ? s.rule_id === body.rule_id : false);
    if (match) {
      mockSuspendedIPs.splice(i, 1);
      released++;
    }
  }
  return { released };
}

// 测试用：把 store 恢复到初始 fixture（供单测隔离）。
export function resetIPFrequencyMock(): void {
  mockIPFrequencyRules.splice(
    0,
    mockIPFrequencyRules.length,
    ...makeMockIPFrequencyRules(),
  );
  nextIPFrequencyId =
    mockIPFrequencyRules.reduce((m, r) => Math.max(m, r.Rule.id), 0) + 1;
  // 挂起列表恢复为初始 7 条
  const initial: SuspendedIP[] = [
    {
      ip: "203.0.113.55",
      rule_id: 1,
      rule_name: "高频发信限制",
      action: "reject",
      suspended_at: "2024-01-15T17:05:00Z",
      expires_at: "2024-01-15T17:35:00Z",
      reason: "15分钟连接数超过1000次",
    },
    {
      ip: "203.0.113.88",
      rule_id: 1,
      rule_name: "高频发信限制",
      action: "reject",
      suspended_at: "2024-01-15T17:10:00Z",
      expires_at: "2024-01-15T17:40:00Z",
      reason: "认证失败超过20次/小时",
    },
    {
      ip: "203.0.113.120",
      rule_id: 1,
      rule_name: "高频发信限制",
      action: "reject",
      suspended_at: "2024-01-15T16:50:00Z",
      expires_at: "2024-01-15T17:20:00Z",
      reason: "并发连接超过50",
    },
    {
      ip: "203.0.113.200",
      rule_id: 1,
      rule_name: "高频发信限制",
      action: "reject",
      suspended_at: "2024-01-15T17:00:00Z",
      expires_at: "2024-01-15T17:30:00Z",
      reason: "每日连接数超过5000",
    },
    {
      ip: "203.0.113.15",
      rule_id: 1,
      rule_name: "���频��信限制",
      action: "reject",
      suspended_at: "2024-01-15T17:12:00Z",
      expires_at: "2024-01-15T17:42:00Z",
      reason: "单连接认证失败超过3次",
    },
    {
      ip: "172.16.100.1",
      rule_id: 5,
      rule_name: "VPN出口IP监控",
      action: "disconnect",
      suspended_at: "2024-01-15T16:45:00Z",
      expires_at: "2024-01-15T17:00:00Z",
      reason: "并发连接超过100",
    },
    {
      ip: "172.16.100.2",
      rule_id: 5,
      rule_name: "VPN出口IP监控",
      action: "disconnect",
      suspended_at: "2024-01-15T16:55:00Z",
      expires_at: "2024-01-15T17:10:00Z",
      reason: "单连接认证失败超过5次",
    },
  ];
  mockSuspendedIPs.splice(0, mockSuspendedIPs.length, ...initial);
}

// ════════════════════════════════════════════════════════════════════════════════
// IP 黑白名单（mock）
// 数据结构对齐 webapp `IPFilterRuleView`（webapp/src/types/ip-filter.ts）。
// 字段映射：list_type ∈ {blacklist,whitelist}, ip_config_type ∈ {single,range},
// action ∈ {accept,reject,quarantine,sideline,discard,audit}。
// ════════════════════════════════════════════════════════════════════════════════

// mock 全局 IP 组元信息（GT-11464：expression 组多选数据源，
// 对齐真实端点 GET /unified-rules/_meta/groups?type=ip 的 {items:[{id,label,rule_id}]}）。
// rule_id 刻意避开 9001-9099（群组策略 mock 写路由按 /unified-rules/90\d\d 收窄）。
export function mockIPGroupsMetaList(): { items: IPGroupMeta[] } {
  const items: IPGroupMeta[] = [
    { id: "grp:可信IP", label: "可信IP", rule_id: 8101 },
    { id: "grp:合作伙伴IP", label: "合作伙伴IP", rule_id: 8102 },
    { id: "grp:CDN节点", label: "CDN节点", rule_id: 8103 },
    { id: "grp:VPN出口", label: "VPN出口", rule_id: 8104 },
    { id: "grp:办公网络", label: "办公网络", rule_id: 8105 },
    { id: "grp:可疑来源", label: "可疑来源", rule_id: 8106 },
    { id: "grp:恶意IP库", label: "恶意IP库", rule_id: 8107 },
  ];
  return { items };
}

function makeIpFilterRule(input: {
  id: number;
  name: string;
  description?: string;
  list_type: "blacklist" | "whitelist";
  ip_config_type: "single" | "range" | "expression";
  ip_value: string;
  action: "accept" | "reject" | "quarantine" | "sideline" | "discard" | "audit";
  priority: number;
  is_active: boolean;
  valid_until?: string;
  updated_at?: string;
  add_headers?: { key: string; value: string }[];
  ip_groups?: number[];
}): IPFilterRuleView {
  return {
    id: input.id,
    name: input.name,
    description: input.description ?? "",
    list_type: input.list_type,
    ip_config_type: input.ip_config_type,
    ip_value: input.ip_value,
    action: input.action,
    priority: input.priority,
    is_active: input.is_active,
    valid_from: null,
    valid_until: input.valid_until ?? null,
    add_headers: input.add_headers,
    ip_groups: input.ip_groups,
    created_at: "2024-01-10T08:00:00Z",
    updated_at: input.updated_at ?? "2024-07-01T00:00:00Z",
    is_expired: input.valid_until
      ? new Date(input.valid_until) < new Date()
      : false,
  };
}

function makeMockIPFilterRules(): IPFilterRuleView[] {
  // 13 条 blacklist + 10 条 whitelist，动作分布对齐 demo。
  // 注意：fixture 里存网关 action 枚举（accept/reject/quarantine/discard/audit/sideline），
  // 前端读取时再映射到 demo 展示词（block/drop/review/deliver/tagDeliver/quarantine）。
  return [
    // ─── Blacklist (13 条) ───
    makeIpFilterRule({
      id: 1,
      name: "已知威胁 IP",
      description: "来自威胁情报的拦截列表",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "203.0.113.0/24",
      action: "reject",
      priority: 100,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 2,
      name: "匿名代理",
      description: "公开匿名代理服务",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "198.51.100.0/24",
      action: "discard",
      priority: 200,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 3,
      name: "内部探测日志",
      description: "",
      list_type: "blacklist",
      ip_config_type: "single",
      ip_value: "192.168.100.50",
      action: "audit",
      priority: 210,
      is_active: true,
      updated_at: "2026-07-03T10:23:00Z",
    }),
    makeIpFilterRule({
      id: 4,
      name: "已下线临时封禁",
      description: "原攻击来源已清除",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "203.0.113.64/27",
      action: "reject",
      priority: 220,
      is_active: false,
      valid_until: "2024-12-31",
    }),
    makeIpFilterRule({
      id: 5,
      name: "垃圾邮件源 1",
      description: "持续发垃圾内容",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "192.0.2.0/24",
      action: "quarantine",
      priority: 230,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 6,
      name: "垃圾邮件源 2",
      description: "EDU 教育网段滥用",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "198.18.0.0/15",
      action: "quarantine",
      priority: 240,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 7,
      name: "扫描器探测",
      description: "端口扫描源",
      list_type: "blacklist",
      ip_config_type: "single",
      ip_value: "203.0.113.123",
      action: "discard",
      priority: 250,
      is_active: false,
    }),
    makeIpFilterRule({
      id: 8,
      name: "僵尸网络 C2",
      description: "C&C 服务器",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "10.0.5.0/24",
      action: "reject",
      priority: 260,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 9,
      name: "钓鱼源",
      description: "仿冒登录页面源 IP",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "198.51.100.128/25",
      action: "quarantine",
      priority: 270,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 10,
      name: "暴力破解源 1",
      description: "持续登录失败",
      list_type: "blacklist",
      ip_config_type: "single",
      ip_value: "10.0.0.5",
      action: "reject",
      priority: 280,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 11,
      name: "申诉解封申请",
      description: "已完成审核",
      list_type: "blacklist",
      ip_config_type: "single",
      ip_value: "203.0.113.77",
      action: "audit",
      priority: 290,
      is_active: false,
      valid_until: "2025-06-30",
    }),
    makeIpFilterRule({
      id: 12,
      name: "可疑内容源",
      description: "低信誉内容源",
      list_type: "blacklist",
      ip_config_type: "range",
      ip_value: "10.0.9.0/24",
      action: "audit",
      priority: 300,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 13,
      name: "恶意IP库联动",
      description: "表达式引用恶意 IP 库并排除误报网段",
      list_type: "blacklist",
      ip_config_type: "expression",
      ip_value: "203.0.113.0/24;!203.0.113.66",
      ip_groups: [8107],
      action: "audit",
      priority: 310,
      is_active: true,
    }),
    // ─── Whitelist (10 条) ───
    makeIpFilterRule({
      id: 100,
      name: "可信IP组",
      description: "内部可信 IP 组放行（表达式引用组）",
      list_type: "whitelist",
      ip_config_type: "expression",
      ip_value: "",
      ip_groups: [8101],
      action: "accept",
      priority: 10,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 101,
      name: "合作伙伴邮件服务器",
      description: "已签约白名单",
      list_type: "whitelist",
      ip_config_type: "range",
      ip_value: "203.0.113.128/25",
      action: "accept",
      priority: 20,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 102,
      name: "邮件认证 DKIM 来源",
      description: "",
      list_type: "whitelist",
      ip_config_type: "range",
      ip_value: "192.0.2.128/25",
      action: "accept",
      priority: 30,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 103,
      name: "内部 SMTP",
      description: "已认证的内部出站",
      list_type: "whitelist",
      ip_config_type: "single",
      ip_value: "192.168.1.10",
      action: "accept",
      priority: 40,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 104,
      name: "云邮件中继",
      list_type: "whitelist",
      ip_config_type: "range",
      ip_value: "172.16.0.0/16",
      action: "accept",
      priority: 50,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 105,
      name: "标记投递来源",
      description: "coremail 反垃圾联动，标记后投递",
      list_type: "whitelist",
      ip_config_type: "range",
      ip_value: "172.17.0.0/16",
      action: "accept",
      priority: 60,
      is_active: true,
      add_headers: [{ key: "X-Whitelist", value: "yes" }],
    }),
    makeIpFilterRule({
      id: 106,
      name: "邮件服务商 2",
      description: "",
      list_type: "whitelist",
      ip_config_type: "range",
      ip_value: "198.18.0.0/26",
      action: "accept",
      priority: 70,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 107,
      name: "监控源",
      description: "内部审��服务调用",
      list_type: "whitelist",
      ip_config_type: "single",
      ip_value: "192.168.99.1",
      action: "accept",
      priority: 80,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 108,
      name: "CDN 边缘",
      description: "回源邮件网关",
      list_type: "whitelist",
      ip_config_type: "range",
      ip_value: "192.0.2.0/26",
      action: "accept",
      priority: 90,
      is_active: true,
    }),
    makeIpFilterRule({
      id: 110,
      name: "临时白名单_已过期",
      description: "原应急放行",
      list_type: "whitelist",
      ip_config_type: "single",
      ip_value: "203.0.113.222",
      action: "accept",
      priority: 100,
      is_active: false,
      valid_until: "2024-08-30",
    }),
  ];
}

export const mockIPFilterRules: IPFilterRuleView[] = makeMockIPFilterRules();

export function mockIPFilterRulesList(query: {
  page?: number;
  page_size?: number;
  q?: string;
  list_type?: "blacklist" | "whitelist";
  is_active?: boolean;
}) {
  let items = [...mockIPFilterRules];
  if (query.list_type) {
    items = items.filter((r) => r.list_type === query.list_type);
  }
  if (query.is_active !== undefined) {
    items = items.filter((r) => r.is_active === query.is_active);
  }
  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter(
      (r) =>
        String(r.id).includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.ip_value.toLowerCase().includes(q) ||
        String(r.priority).includes(q),
    );
  }
  const page = query.page || 1;
  const pageSize = query.page_size || 20;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// RBL 过滤（mock）
// ════════════════════════════════════════════════════════════════════════════════

function makeRBLRule(input: {
  id: number;
  name: string;
  description?: string;
  match_mode: RBLFilterMatchMode;
  match_servers: string[];
  // 允许旧枚举值：下面的 mock 规则刻意保留 block/mark 存量数据
  product_action: RBLFilterProductAction | RBLFilterLegacyProductAction;
  action: string;
  priority: number;
  is_active: boolean;
  valid_until?: string;
}): RBLFilterRuleView {
  return {
    id: input.id,
    name: input.name,
    description: input.description ?? "",
    match_mode: input.match_mode,
    match_servers: input.match_servers,
    product_action: input.product_action,
    action: input.action,
    priority: input.priority,
    is_active: input.is_active,
    valid_from: null,
    valid_until: input.valid_until ?? null,
    created_at: "2024-01-10T08:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    is_expired: input.valid_until
      ? new Date(input.valid_until) < new Date()
      : false,
  };
}

function makeMockRBLFilterRules(): RBLFilterRuleView[] {
  return [
    makeRBLRule({
      id: 1,
      name: "已知垃圾邮件源拦截",
      description: "通过 Spamhaus + SpamCop 共同命中后拦截",
      match_mode: "specific",
      match_servers: ["zen.spamhaus.org", "bl.spamcop.net"],
      product_action: "block",
      action: "reject",
      priority: 100,
      is_active: true,
    }),
    makeRBLRule({
      id: 2,
      name: "可疑邮件隔离",
      description: "Barracuda 单源命中，谨慎起见先隔离观察",
      match_mode: "specific",
      match_servers: ["b.barracudacentral.org"],
      product_action: "quarantine",
      action: "quarantine",
      priority: 200,
      is_active: true,
    }),
    makeRBLRule({
      id: 3,
      name: "开放转发源标记",
      description: "公共 RBL 命中后添加 header 标记",
      match_mode: "specific",
      match_servers: ["zen.spamhaus.org"],
      product_action: "mark",
      action: "tag",
      priority: 300,
      is_active: true,
    }),
    makeRBLRule({
      id: 4,
      name: "任一 RBL 命中即拦截",
      description: "任意一个 RBL 命中都触发阻断",
      match_mode: "any",
      match_servers: [],
      product_action: "block",
      action: "reject",
      priority: 50,
      is_active: true,
    }),
    makeRBLRule({
      id: 5,
      name: "临时测试规则",
      description: "已禁用，保留以备恢复",
      match_mode: "specific",
      match_servers: ["zen.spamhaus.org"],
      product_action: "block",
      action: "reject",
      priority: 999,
      is_active: false,
      valid_until: "2024-12-31",
    }),
  ];
}

export const mockRBLFilterRules: RBLFilterRuleView[] = makeMockRBLFilterRules();

export function mockRBLFilterRulesList(query: {
  page?: number;
  page_size?: number;
  q?: string;
  match_mode?: RBLFilterMatchMode;
  // 允许旧枚举值：mock 规则里保留 block/mark 存量数据，用于覆盖 parseRblConfig 的兼容读路径
  product_action?: RBLFilterProductAction | RBLFilterLegacyProductAction;
  is_active?: boolean;
}) {
  let items = [...mockRBLFilterRules];
  if (query.match_mode) {
    items = items.filter((r) => r.match_mode === query.match_mode);
  }
  if (query.product_action) {
    items = items.filter((r) => r.product_action === query.product_action);
  }
  if (query.is_active !== undefined) {
    items = items.filter((r) => r.is_active === query.is_active);
  }
  if (query.q) {
    const q = query.q.toLowerCase();
    items = items.filter(
      (r) =>
        String(r.id).includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.match_servers.some((s) => s.toLowerCase().includes(q)),
    );
  }
  const page = query.page || 1;
  const pageSize = query.page_size || 20;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

// RBL 预置 detection profiles（与 demo/spec 默认服务器保持一致）
export const mockRBLDetectionProfiles: DetectionProfile[] = [
  {
    id: 1,
    config_type: "rbl",
    name: "zen.spamhaus.org",
    value: JSON.stringify({ timeout_seconds: 5, retry_count: 1 }),
    is_active: true,
    created_at: "2024-01-10T08:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
  {
    id: 2,
    config_type: "rbl",
    name: "bl.spamcop.net",
    value: JSON.stringify({ timeout_seconds: 5, retry_count: 1 }),
    is_active: true,
    created_at: "2024-01-10T08:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
  {
    id: 3,
    config_type: "rbl",
    name: "b.barracudacentral.org",
    value: JSON.stringify({ timeout_seconds: 5, retry_count: 1 }),
    is_active: true,
    created_at: "2024-01-10T08:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  },
];

export function mockRBLFilterStats(_days: number) {
  return {
    stats: {
      blocked: 1245,
      quarantined: 234,
      marked: 56,
      total_hits: 1535,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// 海外邮件检测（mock）
// ════════════════════════════════════════════════════════════════════════════════

// 与 demo 默认一致：inbound 默认开启并阻断，outbound/internal 默认关闭
// （关闭时 action 不生效，仅作为“启用后落回什么”的占位）。
const defaultOverseasDirections: Record<
  "inbound" | "outbound" | "internal",
  OverseasMailDirConfig
> = {
  inbound: { enabled: true, action: "block" },
  outbound: { enabled: false, action: "block" },
  internal: { enabled: false, action: "block" },
};

export function mockOverseasMailConfig(): OverseasMailConfigResponse {
  return {
    directions: defaultOverseasDirections,
    hit_stats: {
      inbound: 1280,
      outbound: 56,
      internal: 3,
    },
  };
}

// ─── 自定义 IP 定位库（GeoIP rules，mock）──────────────────────────────────
// 35 条数据照抄 demo `generateMockGeoIpRules()`
// (design/origin/demo/components/filter-rules-new/connection-layer-page.tsx)，
// 字段名做 camelCase → snake_case 映射，数值保持逐条一致，便于分页/搜索行为对齐。
function generateMockGeoIpRules(): GeoIpRule[] {
  const base: GeoIpRule[] = [
    {
      id: 1,
      ip_range: "8.8.8.0/24",
      region_code: "US",
      region_name: "Google DNS",
      updated_at: "2024-01-15 14:30",
    },
    {
      id: 2,
      ip_range: "114.114.0.0/16",
      region_code: "CN",
      region_name: "114DNS",
      updated_at: "2024-01-14 09:15",
    },
    {
      id: 3,
      ip_range: "103.0.0.0/8",
      region_code: "SG",
      region_name: "Singapore",
      updated_at: "2024-01-13 11:45",
    },
  ];
  const regions = [
    { code: "US", name: "United States" },
    { code: "CN", name: "China" },
    { code: "JP", name: "Japan" },
    { code: "DE", name: "Germany" },
    { code: "UK", name: "United Kingdom" },
    { code: "FR", name: "France" },
    { code: "AU", name: "Australia" },
    { code: "KR", name: "South Korea" },
    { code: "IN", name: "India" },
    { code: "BR", name: "Brazil" },
    { code: "CA", name: "Canada" },
    { code: "RU", name: "Russia" },
  ];
  for (let i = 4; i <= 35; i++) {
    const region = regions[(i - 4) % regions.length];
    base.push({
      id: i,
      ip_range: `${50 + i}.${(i * 3) % 256}.0.0/16`,
      region_code: region.code,
      region_name: `${region.name} ISP ${i}`,
      updated_at: `2024-01-${String(10 + (i % 20)).padStart(2, "0")} ${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
    });
  }
  return base;
}

export const mockGeoIpRules: GeoIpRule[] = generateMockGeoIpRules();

export function mockGeoIpRulesList(query: {
  page?: number;
  page_size?: number;
  q?: string;
}): GeoIpRuleListResponse {
  let items = [...mockGeoIpRules];
  if (query.q) {
    const q = query.q;
    items = items.filter(
      (r) =>
        r.ip_range.includes(q) ||
        r.region_code.toUpperCase().includes(q.toUpperCase()) ||
        r.region_name.toLowerCase().includes(q.toLowerCase()),
    );
  }
  const page = query.page || 1;
  const pageSize = query.page_size || 10;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

const GEOIP_RULE_MOCK_TIMESTAMP = "2026-07-13 00:00";

export function mockCreateGeoIpRule(payload: {
  ip_range?: string;
  region_code?: string;
  region_name?: string;
}): GeoIpRule {
  const id = mockGeoIpRules.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const rule: GeoIpRule = {
    id,
    ip_range: payload.ip_range ?? "",
    region_code: payload.region_code ?? "",
    region_name: payload.region_name ?? "",
    updated_at: GEOIP_RULE_MOCK_TIMESTAMP,
  };
  mockGeoIpRules.push(rule);
  return rule;
}

export function mockUpdateGeoIpRule(
  id: number,
  payload: { ip_range?: string; region_code?: string; region_name?: string },
): GeoIpRule | undefined {
  const idx = mockGeoIpRules.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  const updated: GeoIpRule = {
    ...mockGeoIpRules[idx],
    ...payload,
    id,
    updated_at: GEOIP_RULE_MOCK_TIMESTAMP,
  };
  mockGeoIpRules[idx] = updated;
  return updated;
}

export function mockDeleteGeoIpRule(id: number): void {
  const idx = mockGeoIpRules.findIndex((r) => r.id === id);
  if (idx !== -1) mockGeoIpRules.splice(idx, 1);
}

// ════════════════════════════════════════════════════════════════════════════════
// 发信人黑���名单（sender_filter，mock）
// 数据结构对齐统一规则系统 `Rule`（webapp/src/types/unified-rules.ts）：
//   - condition_tree 由 `buildConditionTree`（src/lib/api/sender-filter.ts）生成，
//     保证 `resolveSenderFilterRule` 能按同一套语法解析回 sender_config/ip_range。
//   - metadata 携带 `{feature:'sender_filter', sender_config, ip_range, list_type}`，
//     与 condition_tree 保持一致（`resolveSenderFilterRule` 的 metadata/tree 双重校验）。
// ════════════════════════════════════════════════════════════════════════════════

function sfRule(o: {
  id: number;
  name: string;
  action: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  sender: SenderFilterSenderConfig;
  list_type: "blacklist" | "whitelist";
}): Rule {
  const ct = buildConditionTree({
    sender_config: o.sender,
    ip_range: { type: "all" },
  });
  return {
    id: o.id,
    name: o.name,
    rule_class: "action",
    stage: "rcpt",
    priority: o.priority,
    condition_tree: JSON.stringify(ct),
    action: o.action,
    is_active: o.is_active,
    tags: [],
    metadata: JSON.stringify({
      feature: "sender_filter",
      sender_config: o.sender,
      ip_range: { type: "all" },
      list_type: o.list_type,
    }),
    created_at: o.created_at,
    updated_at: o.created_at,
  };
}

// 5 条 demo 数据：3 条黑名单（拒绝/隔离/旁路观察）+ 2 条白名单（放行）。
export function mockSenderFilterRulesList(): { items: Rule[] } {
  return {
    items: [
      sfRule({
        id: 1,
        name: "垃圾邮件发送者",
        action: "reject",
        priority: 500,
        is_active: true,
        created_at: "2026-03-20T10:30:00Z",
        sender: { type: "individual", value: "spam@bad.com" },
        list_type: "blacklist",
      }),
      sfRule({
        id: 2,
        name: "钓鱼域名",
        action: "quarantine",
        priority: 500,
        is_active: true,
        created_at: "2026-03-19T14:15:00Z",
        sender: { type: "domain", value: "phish.com" },
        list_type: "blacklist",
      }),
      sfRule({
        id: 3,
        name: "可疑群组",
        action: "audit",
        priority: 500,
        is_active: false,
        created_at: "2026-03-18T09:00:00Z",
        sender: { type: "group", value: "可疑来源组" },
        list_type: "blacklist",
      }),
      sfRule({
        id: 4,
        name: "可信合作伙伴",
        action: "accept",
        priority: 800,
        is_active: true,
        created_at: "2026-03-20T09:00:00Z",
        sender: { type: "individual", value: "partner@trusted.com" },
        list_type: "whitelist",
      }),
      sfRule({
        id: 5,
        name: "内部财务组",
        action: "accept",
        priority: 800,
        is_active: true,
        created_at: "2026-03-17T15:30:00Z",
        sender: { type: "group", value: "财务��门" },
        list_type: "whitelist",
      }),
    ],
  };
}

// 群组下拉/群组管理数据：�� `ruleToGroup`（src/lib/api/groups.ts）契约构造 —
//   - 分组名取自 tags 里 `grp:<name>` 前缀（GROUP_TAG_PREFIX）���而非 `name` 字段；
//   - 分组类型优先取 metadata.group_type，其次由 stage 反推（GROUP_TYPE_TO_STAGE 的反映射）；
//   - 普通组 condition_tree 用 `serializeMembers` 生成（与 `parseMembers` 互为逆运算）；
//     特征组直接给 condition_tree（serde 的 AND[OR[any],AND[all]] 形态）；
//   - member_count / reference_count 显式下发（与真实后端 include=member_count,reference_count
//     的响应一致），memberCount 不再依赖成员数组长度，特征组的 member_count = 条件数。
// 数据值照抄群组策略页 demo 的 staticGroups + 特征组（html_spec filter-rules-group-policy），
// 群组在真实产品中是唯一数据面，sender_filter 下拉与群组管理共享这份数据。
function sfGroupRule(o: {
  id: number;
  name: string;
  type: GroupType;
  members?: string[];
  condition_tree?: RuleNode;
  member_count?: number;
  reference_count?: number;
  created_at: string;
}): Rule {
  const tree = o.condition_tree ?? serializeMembers(o.type, o.members ?? []);
  return {
    id: o.id,
    name: o.name,
    rule_class: "tag",
    stage: GROUP_TYPE_TO_STAGE[o.type],
    priority: 100,
    condition_tree: JSON.stringify(tree),
    is_active: true,
    tags: [GROUP_TAG_PREFIX + o.name],
    metadata: JSON.stringify({ group_type: o.type }),
    ...(o.member_count != null ? { member_count: o.member_count } : {}),
    ...(o.reference_count != null ? { reference_count: o.reference_count } : {}),
    created_at: o.created_at,
    updated_at: o.created_at,
  } as Rule;
}

// 特征组条件树（serde 契约：根 = AND[ OR[any组], AND[all组] ]，单组时塌缩为该组节点）
const featureTreePhishing: RuleNode = {
  type: "AND",
  children: [
    {
      type: "OR",
      children: [
        { type: "condition", field: "exec_imp", operator: "eq", value: "hit" },
        { type: "condition", field: "domain_imp", operator: "ge", value: "80" },
      ],
    },
    {
      type: "AND",
      children: [
        { type: "condition", field: "dmarc_result", operator: "eq", value: "fail" },
      ],
    },
  ],
};

const featureTreeMaliciousAttachment: RuleNode = {
  type: "OR",
  children: [
    { type: "condition", field: "attachment_names", operator: "contain", value: ".exe" },
    { type: "condition", field: "virus_scan_result", operator: "eq", value: "infected" },
  ],
};

const featureTreeBulkMarketing: RuleNode = {
  type: "AND",
  children: [
    { type: "condition", field: "sender_rate_limit_15", operator: "ge", value: "100" },
    { type: "condition", field: "url_count", operator: "ge", value: "5" },
  ],
};

export function mockSenderFilterGroupsList(): { items: Rule[] } {
  return {
    items: [
      sfGroupRule({
        id: 8101,
        name: "高管邮箱",
        type: "recipient",
        created_at: "2024-01-10T00:00:00Z",
        member_count: 15,
        reference_count: 3,
        members: Array.from({ length: 15 }, (_, i) => `exec${i + 1}@company.com`),
      }),
      sfGroupRule({
        id: 8102,
        name: "研发部门",
        type: "sender",
        created_at: "2024-01-08T00:00:00Z",
        member_count: 120,
        reference_count: 1,
        members: Array.from({ length: 120 }, (_, i) => `dev${i + 1}@company.com`),
      }),
      sfGroupRule({
        id: 8103,
        name: "可信IP",
        type: "ip",
        created_at: "2024-01-05T00:00:00Z",
        member_count: 8,
        reference_count: 2,
        members: Array.from({ length: 8 }, (_, i) => `192.168.1.${10 + i}`),
      }),
      sfGroupRule({
        id: 8104,
        name: "敏感关键词",
        type: "content",
        created_at: "2024-01-01T00:00:00Z",
        member_count: 45,
        reference_count: 4,
        members: Array.from({ length: 45 }, (_, i) => `敏感词${i + 1}`),
      }),
      sfGroupRule({
        id: 8105,
        name: "合作伙伴域名",
        type: "sender",
        created_at: "2023-12-20T00:00:00Z",
        member_count: 25,
        reference_count: 2,
        members: Array.from({ length: 25 }, (_, i) => `partner${i + 1}.com`),
      }),
      sfGroupRule({
        id: 8106,
        name: "钓鱼仿冒特征",
        type: "feature",
        created_at: "2024-01-12T00:00:00Z",
        member_count: 3,
        reference_count: 2,
        condition_tree: featureTreePhishing,
      }),
      sfGroupRule({
        id: 8107,
        name: "恶意附件特���",
        type: "feature",
        created_at: "2024-01-12T00:00:00Z",
        member_count: 2,
        reference_count: 0,
        condition_tree: featureTreeMaliciousAttachment,
      }),
      sfGroupRule({
        id: 8108,
        name: "批量营销特征",
        type: "feature",
        created_at: "2024-01-12T00:00:00Z",
        member_count: 2,
        reference_count: 1,
        condition_tree: featureTreeBulkMarketing,
      }),
    ],
  };
}

// 从共享的「群组」数据（mockSenderFilterGroupsList，与群组管理 / 群组策略同源）
// 按 group_type 派生 `_meta/groups` 元信息，供高级过滤规则的 group 面板条件
//（发信人组、特征组等）在配置面板的下拉里筛选选择。契约对齐真实端点
// GET /unified-rules/_meta/groups?type=<T> 的 {items:[{id,label,rule_id}]}：
//   - id 取 tag（grp:<名>，引擎按该 tag 建键，MapKeySelect 直接用 id ���为存储值���；
//   - label 取群组名；rule_id 取规则 ID。
// 复用同一份数据面，保证下拉选项与群组策略模块的发信人组始终一致。
export function mockGroupsMetaByType(type: GroupType): { items: IPGroupMeta[] } {
  const items: IPGroupMeta[] = mockSenderFilterGroupsList()
    .items.filter((r) => {
      try {
        return (JSON.parse(r.metadata ?? "{}") as { group_type?: string }).group_type === type;
      } catch {
        return false;
      }
    })
    .map((r) => ({
      id: r.tags?.[0] ?? `${GROUP_TAG_PREFIX}${r.name}`,
      label: r.name,
      rule_id: r.id,
    }));
  return { items };
}

// ════════════════════════════════════════════════════════════════════════════════
// 群组策略（page=group_policy，mock）
// 5 条演示规则照抄群组策略页 demo 的 mockGroupPolicies（含「IP群组1」双规则短路场景，
// 该群组名刻意不在群组列表里，与 demo 一致）。metadata 遵循 GroupPolicyMetadata 契约
// （feature/target_groups/stage_policies），stage_policies 附 summary 供表格徽标展示。
// 可变 state：状态开关（PUT {is_active}）与删除在 mock 会话内生效。
// ══���═════════════════════════════════════════════════════════════════════════════

interface GpFixtureSpec {
  id: number;
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  target_groups: Record<string, string[]>;
  stage_policies: Record<string, { status: string; summary?: string; params?: Record<string, unknown> }>;
}

function gpRule(o: GpFixtureSpec): Rule {
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    rule_class: "tag",
    stage: "data",
    priority: o.priority,
    condition_tree: JSON.stringify({ type: "AND", children: [] }),
    is_active: o.is_active,
    tags: [`gp:${o.name}`],
    metadata: JSON.stringify({
      feature: "group_policy",
      target_groups: {
        senderGroup: [],
        senderIpGroup: [],
        recipientGroup: [],
        contentGroup: [],
        featureGroup: [],
        ...o.target_groups,
      },
      stage_policies: o.stage_policies,
    }),
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  } as Rule;
}

let groupPolicyRulesState: Rule[] | null = null;

function groupPolicyRulesSeed(): Rule[] {
  return [
    gpRule({
      id: 9001,
      name: "高管邮箱快速通道",
      description: "针对高管邮箱的��化通道",
      priority: 0,
      is_active: true,
      target_groups: { recipientGroup: ["高管邮箱"] },
      stage_policies: {
        overseas: { status: "disable", summary: "豁免海外检测" },
        attachment: { status: "custom", summary: "100M/关OCR" },
        similarDetection: { status: "disable", summary: "禁用相似" },
      },
    }),
    gpRule({
      id: 9002,
      name: "可信IP通道",
      priority: 1,
      is_active: true,
      target_groups: { senderIpGroup: ["可信IP"] },
      stage_policies: {
        rbl: { status: "disable", summary: "豁免RBL" },
        authSpoofing: { status: "disable", summary: "豁免认证" },
      },
    }),
    gpRule({
      id: 9003,
      name: "研发部门外发",
      priority: 2,
      is_active: false,
      target_groups: { senderGroup: ["研发部门"] },
      stage_policies: {
        attachment: { status: "custom", summary: "50M/开OCR" },
        similarDetection: { status: "disable", summary: "禁用相似" },
      },
    }),
    // 演示「优先级与阶段顺序」反直觉场景：同一 IP 群组命中两条策略
    gpRule({
      id: 9004,
      name: "IP群组1-附件检测禁用",
      description: "优先级更高，但配置位于阶段3",
      priority: 1,
      is_active: true,
      target_groups: { senderIpGroup: ["IP群组1"] },
      stage_policies: {
        attachment: { status: "disable", summary: "禁用附件检测" },
      },
    }),
    gpRule({
      id: 9005,
      name: "IP群组1-RBL隔离",
      description: "优先级较低，但���置位于阶段1，会先短路",
      priority: 2,
      is_active: true,
      target_groups: { senderIpGroup: ["IP群组1"] },
      stage_policies: {
        rbl: { status: "custom", summary: "命中隔离", params: { action: "quarantine" } },
      },
    }),
  ];
}

function gpState(): Rule[] {
  if (!groupPolicyRulesState) groupPolicyRulesState = groupPolicyRulesSeed();
  return groupPolicyRulesState;
}

export function mockGroupPolicyRulesList(): { items: Rule[] } {
  return { items: gpState() };
}

// PUT /unified-rules/{id}（mock id 段 9xxx）：合并部分字段（状态开关只发 {is_active}），
// 全量保存则同步 name/priority/metadata。
export function mockUpdateGroupPolicyRule(id: number, body: unknown): Rule | null {
  const state = gpState();
  const idx = state.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const patch = (body ?? {}) as Partial<Rule> & { metadata?: unknown };
  const next: Rule = {
    ...state[idx],
    ...(patch.name != null ? { name: patch.name } : {}),
    ...(patch.description != null ? { description: patch.description } : {}),
    ...(patch.priority != null ? { priority: patch.priority } : {}),
    ...(patch.is_active != null ? { is_active: patch.is_active } : {}),
    ...(patch.metadata != null
      ? { metadata: typeof patch.metadata === "string" ? patch.metadata : JSON.stringify(patch.metadata) }
      : {}),
    updated_at: "2026-07-18T00:00:00Z",
  };
  state[idx] = next;
  return next;
}

export function mockDeleteGroupPolicyRule(id: number): boolean {
  const state = gpState();
  const idx = state.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  state.splice(idx, 1);
  return true;
}

// ════════════════════════════════════════════════════════════════════════════════
// 内容规则（content_rules，mock）
// 保留统一规则的真实���储形态：condition_tree / metadata 均为 JSON 字符串，
// CRUD、测试和导入导出共享同一份可变 fixture，便于浏览器完整走通规格交互。
// ════════════════════════════════════════════════════════════════════════════════

type ContentFixtureAction =
  "deliver" | "tag_deliver" | "isolate" | "review" | "block" | "discard";

const CONTENT_ACTION_MAP: Record<ContentFixtureAction, string> = {
  deliver: "accept",
  tag_deliver: "accept",
  isolate: "quarantine",
  review: "audit",
  block: "reject",
  discard: "discard",
};

function contentFixtureRule(o: {
  id: number;
  name: string;
  priority: number;
  matchType: "keyword" | "regex" | "content_group";
  matchContent: string;
  scopes: Array<"subject" | "body" | "header" | "attachment_names">;
  directions: Partial<
    Record<"receive" | "send" | "internal", ContentFixtureAction>
  >;
  active?: boolean;
  validUntil?: string;
  createdAt: string;
}): Rule {
  const scopes = o.scopes.flatMap((scope) =>
    scope === "body" ? ["text_body", "html_body"] : [scope],
  );
  const directions = Object.fromEntries(
    Object.entries(o.directions).map(([direction, action]) => [
      direction,
      {
        enabled: true,
        action: CONTENT_ACTION_MAP[action as ContentFixtureAction],
      },
    ]),
  );
  const firstProductAction = Object.values(o.directions)[0] ?? "isolate";
  const firstAction = CONTENT_ACTION_MAP[firstProductAction];
  const metadata = {
    feature: "content_rules",
    match_type: o.matchType,
    match_content: o.matchContent,
    scopes,
    directions,
    ...(firstProductAction === "tag_deliver"
      ? {
          mark_config: {
            add_headers: [{ name: "X-OSG-Content-Tag", value: "[广告]" }],
            notify_admin: false,
            notify_sender: false,
          },
        }
      : {}),
  };
  const conditionTree: RuleNode = {
    type: "AND",
    children: [
      {
        type: "condition",
        field: "is_outbound",
        operator: "eq",
        value: o.directions.receive ? "false" : "true",
      },
      o.matchType === "content_group"
        ? {
            type: "condition",
            field: "rcpttags",
            operator: "hasTag",
            value: `grp:${o.matchContent}`,
          }
        : {
            type: "condition",
            field: scopes[0] ?? "subject",
            operator: o.matchType === "regex" ? "match" : "contain",
            value: o.matchContent.split("|")[0],
          },
    ],
  };
  return {
    id: o.id,
    name: o.name,
    description: "",
    page: "content_rules",
    rule_class: "action",
    stage: "data",
    priority: o.priority,
    condition_tree: JSON.stringify(conditionTree),
    action: firstAction,
    metadata: JSON.stringify(metadata),
    is_active: o.active ?? true,
    valid_until: o.validUntil ?? null,
    created_at: o.createdAt,
    updated_at: o.createdAt,
  };
}

let mockContentRules: Rule[] = [
  contentFixtureRule({
    id: 1,
    name: "身份证外发管控",
    priority: 9999,
    matchType: "regex",
    matchContent: "\\d{17}[\\dXx]",
    scopes: ["subject", "body"],
    directions: { send: "block" },
    createdAt: "2026-03-20T14:30:00Z",
  }),
  contentFixtureRule({
    id: 2,
    name: "政治敏感词",
    priority: 100,
    matchType: "keyword",
    matchContent: "敏感词1|敏感词2|敏感词3",
    scopes: ["subject", "body"],
    directions: { receive: "block", send: "block", internal: "isolate" },
    validUntil: "2026-06-30T00:00:00Z",
    createdAt: "2026-03-19T09:00:00Z",
  }),
  contentFixtureRule({
    id: 3,
    name: "内部培训广告",
    priority: 90,
    matchType: "content_group",
    matchContent: "培训广告词库",
    scopes: ["subject", "body", "header"],
    directions: { receive: "tag_deliver", internal: "tag_deliver" },
    active: false,
    createdAt: "2026-03-18T16:00:00Z",
  }),
  contentFixtureRule({
    id: 4,
    name: "银行卡号检测",
    priority: 500,
    matchType: "regex",
    matchContent: "\\d{16,19}",
    scopes: ["body"],
    directions: { receive: "review", send: "block", internal: "review" },
    createdAt: "2026-03-17T10:00:00Z",
  }),
  contentFixtureRule({
    id: 5,
    name: "竞争对手信息泄露",
    priority: 200,
    matchType: "keyword",
    matchContent: "竞品A|竞品B|商业机密",
    scopes: ["subject", "body", "attachment_names"],
    directions: { send: "block", internal: "review" },
    validUntil: "2026-04-15T00:00:00Z",
    createdAt: "2026-03-16T09:00:00Z",
  }),
  ...Array.from({ length: 25 }, (_, index) => {
    const id = index + 6;
    const matchType =
      id % 3 === 0 ? "regex" : id % 3 === 1 ? "keyword" : "content_group";
    return contentFixtureRule({
      id,
      name: `内容规则 #${id}`,
      priority: Math.min(9999, 50 + id * 10),
      matchType,
      matchContent:
        matchType === "regex"
          ? `\\d{${10 + (id % 5)}}`
          : matchType === "content_group"
            ? "通用敏感词库"
            : `关键词${id}|测试词${id}`,
      scopes: id % 2 === 0 ? ["subject", "body"] : ["body", "attachment_names"],
      directions:
        id % 2 === 0
          ? { receive: id % 4 === 0 ? "block" : "isolate" }
          : {
              send: id % 4 === 1 ? "block" : "review",
              internal: "tag_deliver",
            },
      active: id % 5 !== 0,
      createdAt: `2026-03-${String(Math.max(1, 20 - (id % 15))).padStart(2, "0")}T10:00:00Z`,
    });
  }),
];

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function mockContentRulesList(params: URLSearchParams): {
  items: Rule[];
  total: number;
  page: number;
  page_size: number;
} {
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const status = params.get("status");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.max(1, Number(params.get("page_size")) || 10);
  let rules = [...mockContentRules];
  if (query)
    rules = rules.filter(
      (rule) =>
        rule.name.toLowerCase().includes(query) ||
        String(rule.id).includes(query),
    );
  const isExpired = (rule: Rule) =>
    Boolean(
      rule.valid_until && new Date(rule.valid_until).getTime() <= Date.now(),
    );
  if (status === "enabled")
    rules = rules.filter((rule) => rule.is_active && !isExpired(rule));
  if (status === "disabled")
    rules = rules.filter((rule) => !rule.is_active && !isExpired(rule));
  rules.sort(
    (left, right) => right.priority - left.priority || right.id - left.id,
  );
  return {
    items: rules.slice((page - 1) * pageSize, page * pageSize),
    total: rules.length,
    page,
    page_size: pageSize,
  };
}

function normalizeContentRule(
  body: unknown,
  id: number,
  previous?: Rule,
): Rule {
  const source = readObject(body);
  const now = "2026-07-16T06:00:00Z";
  const conditionTree =
    source.condition_tree ?? readObject(previous?.condition_tree);
  const metadata = source.metadata ?? readObject(previous?.metadata);
  return {
    id,
    name: String(source.name ?? previous?.name ?? `内容规则 #${id}`),
    description: String(source.description ?? previous?.description ?? ""),
    page: "content_rules",
    rule_class: "action",
    stage: "data",
    priority: Number(source.priority ?? previous?.priority ?? 100),
    condition_tree: JSON.stringify(conditionTree),
    action: String(source.action ?? previous?.action ?? "quarantine"),
    metadata: JSON.stringify(metadata),
    is_active: Boolean(source.is_active ?? previous?.is_active ?? true),
    valid_from: (source.valid_from ?? previous?.valid_from ?? null) as
      string | null,
    valid_until: (source.valid_until ?? previous?.valid_until ?? null) as
      string | null,
    email_type: (source.email_type ?? previous?.email_type) as
      string | undefined,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}

export function mockCreateContentRule(body: unknown): Rule {
  const id = Math.max(0, ...mockContentRules.map((rule) => rule.id)) + 1;
  const rule = normalizeContentRule(body, id);
  mockContentRules.push(rule);
  return rule;
}

export function mockUpdateContentRule(id: number, body: unknown): Rule | null {
  const index = mockContentRules.findIndex((rule) => rule.id === id);
  if (index < 0) return null;
  mockContentRules[index] = normalizeContentRule(
    body,
    id,
    mockContentRules[index],
  );
  return mockContentRules[index];
}

export function mockSetContentRuleStatus(
  id: number,
  active: boolean,
): Rule | null {
  return mockUpdateContentRule(id, { is_active: active });
}

export function mockCopyContentRule(id: number): Rule | null {
  const source = mockContentRules.find((rule) => rule.id === id);
  if (!source) return null;
  return mockCreateContentRule({ ...source, name: `${source.name} - 副本` });
}

export function mockDeleteContentRule(id: number): boolean {
  const before = mockContentRules.length;
  mockContentRules = mockContentRules.filter((rule) => rule.id !== id);
  return mockContentRules.length < before;
}

export function mockBulkContentRules(body: unknown): number[] {
  const source = readObject(body);
  const ids = Array.isArray(source.ids) ? source.ids.map(Number) : [];
  const action = String(source.action ?? "");
  if (action === "delete") ids.forEach(mockDeleteContentRule);
  if (action === "enable" || action === "disable")
    ids.forEach((id) => mockSetContentRuleStatus(id, action === "enable"));
  return ids;
}

function evaluateContentNode(
  node: RuleNode,
  attrs: Record<string, string>,
): boolean {
  if (node.type === "AND")
    return (node.children ?? []).every((child) =>
      evaluateContentNode(child, attrs),
    );
  if (node.type === "OR")
    return (node.children ?? []).some((child) =>
      evaluateContentNode(child, attrs),
    );
  if (node.type === "NOT")
    return !(node.children ?? []).some((child) =>
      evaluateContentNode(child, attrs),
    );
  const actual = attrs[node.field ?? ""] ?? "";
  if (node.operator === "eq") return actual === String(node.value ?? "");
  if (node.operator === "contain")
    return actual.includes(String(node.value ?? ""));
  if (node.operator === "hasTag")
    return actual
      .split(",")
      .map((item) => item.trim())
      .includes(String(node.value ?? ""));
  if (node.operator === "match") {
    try {
      return new RegExp(String(node.value ?? "")).test(actual);
    } catch {
      return false;
    }
  }
  return false;
}

export function mockTestContentRule(body: unknown): {
  matched: boolean;
  evaluated_conditions: unknown[];
} {
  const source = readObject(body);
  const tree = source.condition_tree as RuleNode;
  const attrs = readObject(source.test_attributes) as Record<string, string>;
  return {
    matched: evaluateContentNode(tree, attrs),
    evaluated_conditions: [],
  };
}

export function mockContentRulesExport() {
  return {
    version: "1.0",
    exported_at: "2026-07-16T06:00:00Z",
    scope: "content_rules",
    tenant_context: { mode: "system" },
    data: { rules: [...mockContentRules] },
  };
}

function importSummary(count: number) {
  const empty = { parsed: 0, importable: 0, duplicates: 0, invalid: 0 };
  return {
    summary: {
      rules: { parsed: count, importable: count, duplicates: 0, invalid: 0 },
      detection_profiles: empty,
    },
    tenant_mapping: {
      mode: "restore_original_tenants",
      resolved: count,
      failed: 0,
    },
    duplicates: {},
    invalid_items: {},
  };
}

export function mockPreviewContentRulesImport(body: unknown) {
  const source = readObject(body);
  const file = readObject(source.file);
  const data = readObject(file.data);
  const rules = Array.isArray(data.rules) ? data.rules : [];
  return importSummary(rules.length);
}

export function mockExecuteContentRulesImport(body: unknown) {
  const source = readObject(body);
  const file = readObject(source.file);
  const data = readObject(file.data);
  const rules = Array.isArray(data.rules) ? data.rules : [];
  rules.forEach((rule) => mockCreateContentRule(rule));
  return {
    ...importSummary(rules.length),
    imported: {
      rules: rules.length,
      detection_profiles: 0,
    },
    skipped_duplicates: {
      rules: 0,
      detection_profiles: 0,
    },
  };
}

export function mockContentGroupsList(): { items: Rule[] } {
  return {
    items: [
      sfGroupRule({
        id: 151,
        name: "培训广告词库",
        type: "content",
        created_at: "2026-03-01T00:00:00Z",
        members: ["培训", "课程推广", "限时报名"],
      }),
      sfGroupRule({
        id: 152,
        name: "通用敏感词库",
        type: "content",
        created_at: "2026-03-02T00:00:00Z",
        members: ["机密", "绝密", "内部资料"],
      }),
      sfGroupRule({
        id: 153,
        name: "财务数据词库",
        type: "content",
        created_at: "2026-03-03T00:00:00Z",
        members: ["银行卡", "身份证", "发票"],
      }),
    ],
  };
}

// ══════════���═════════════════════════════════════════════════════════════════════
// 身份认证与仿冒防护（auth-spoofing，mock）
// 配置照抄 demo 默认值（src/components/security/AuthSpoofingPage.tsx 的
// DEFAULT_CONFIG，已是映射到统一 action 的 demo 默认），保证 Mock 模式下页面
// 展示的初始状态与 demo 完全对齐。
// ════════════════════════════════════════════════════════════════════════════════

function defaultAuthSpoofingConfig(): AuthSpoofingConfig {
  return {
    format_checks: {
      mailfrom_empty: { enabled: true, action: "quarantine", observe_mode: false },
      mailfrom_invalid: {
        enabled: true,
        action: "reject",
        observe_mode: false,
      },
      envelope_header_mismatch: {
        enabled: true,
        action: "quarantine",
        observe_mode: false,
      },
    },
    protocol_checks: {
      template: "standard",
      observe_mode: false,
      spf: {
        fail: { enabled: true, action: "reject", observe_mode: false },
        softfail: { enabled: true, action: "quarantine", observe_mode: false },
        none: { enabled: true, action: "audit", observe_mode: false },
        temperror: { enabled: true, action: "audit", observe_mode: false },
      },
      dkim: {
        fail: { enabled: true, action: "quarantine", observe_mode: false },
        neutral: { enabled: true, action: "quarantine", observe_mode: false },
        partial: { enabled: false, action: "accept", observe_mode: false },
        none: { enabled: true, action: "audit", observe_mode: false },
      },
      dmarc: {
        reject: { enabled: true, action: "reject", observe_mode: false },
        quarantine: {
          enabled: true,
          action: "quarantine",
          observe_mode: false,
        },
        none: { enabled: true, action: "audit", observe_mode: false },
        no_record: { enabled: true, action: "quarantine", observe_mode: false },
        query_fail: { enabled: true, action: "audit", observe_mode: false },
      },
      ptr: {
        noptr: { enabled: true, action: "audit", observe_mode: false },
        nomatch: { enabled: true, action: "quarantine", observe_mode: false },
        ehlo_mismatch: {
          enabled: true,
          action: "quarantine",
          observe_mode: false,
        },
      },
    },
    similar_domain: {
      enabled: false,
      action: "quarantine",
      observe_mode: false,
      threshold: 2,
      protected_domains: [],
    },
    display_name_spoof: {
      inbound: { enabled: true, action: "quarantine", observe_mode: false },
      outbound: { enabled: true, action: "quarantine", observe_mode: false },
      internal: { enabled: true, action: "quarantine", observe_mode: false },
      internal_users: [],
    },
  };
}

export function mockAuthSpoofingConfig(): AuthSpoofingConfig {
  // 深拷贝：避免调用方就地修改返回值污染后续 GET。
  return JSON.parse(JSON.stringify(defaultAuthSpoofingConfig()));
}

// 观测统计：hits 总和固定为 23，对齐 demo 硬编码的
// `observeStats.wouldDrop`（AuthSpoofingPage.tsx），让「预计丢弃」脉冲徽标
// 在 Mock 模式下与 demo 展示一致。`days` 只影��回显字段，不影响样本条数/分布。
function authSpoofingObservePoints(): ObserveStatPoint[] {
  return [
    {
      rule_name: "SPF 校验",
      subfeature: "spf",
      subkey: "fail",
      day: "2026-07-13",
      hits: 10,
    },
    {
      rule_name: "SPF 校验",
      subfeature: "spf",
      subkey: "softfail",
      day: "2026-07-14",
      hits: 6,
    },
    {
      rule_name: "DKIM 校验",
      subfeature: "dkim",
      subkey: "fail",
      day: "2026-07-14",
      hits: 4,
    },
    {
      rule_name: "DMARC 校验",
      subfeature: "dmarc",
      subkey: "reject",
      day: "2026-07-15",
      hits: 3,
    },
  ];
}

export function mockAuthSpoofingObserveStats(days: number): {
  days: number;
  points: ObserveStatPoint[];
} {
  return { days, points: authSpoofingObservePoints() };
}

export function mockAuthSpoofingProbe(): ProbeResponse {
  return {
    hits: [
      {
        rule_id: 1,
        rule_name: "SPF 校验",
        action: "quarantine",
        observed: false,
        subfeature: "spf",
        subkey: "fail",
      },
    ],
    final_action: "accept",
  };
}

// ════════════════════════════════════════════���═══════════════════════════════════
// 发信行为管控（behavior_control，mock）
// 数据源自 demo `design/origin/demo/components/sender-behavior-control/mock-data.ts`
// 的 `mockBehaviorRules`（7 条手工命名 + 生成的 #8..#35，共 35 条），并映射到统一规则。
// demo 中的 organization 发件人对象尚未被后端支持，因此 mock 也只生成 individual/group，
// 避免展示出无法保存的规则（GT-12170）。
// 系统 `Rule`：metadata 携带 `BehaviorControlMetadata`（feature/direction/object_config/
// time_window/dim_a/threshold_a/or_enabled/dim_b/threshold_b），action 经
// `PRODUCT_TO_BACKEND` 转换，is_active=demo.enabled，priority=demo.priority，
// created_at/updated_at=demo.createdAt/modifiedAt，rule_class:'action'，stage:'rcpt'，
// page:'behavior_control'，condition_tree:'{}'（该页面不走通用条件树渲染，读取全靠
// metadata���，id 由 'rule-N' 解���为数字 N。
//
// 注：demo 源数据里 rule-7（"双向合计发信限制"）的 `enabled` 字段是 `true`，但本模块
// 的验收测试（behavior-control-mock.test.ts）要求它在 mock 里表现为禁用
// （`is_active` === false），用来在页面上演示"禁用规则"的展示态；这里对该一条记录的
// `enabled` 做了有意的本地覆盖（改为 false）。
// ════════════════════════════════════════════════════════════════════════════════

interface DemoBehaviorRule {
  id: string;
  name: string;
  direction: BehaviorDirection;
  objectType: BehaviorObjectType;
  senderSubType?: BehaviorSenderSubType;
  senderEmail?: string;
  senderGroupId?: string;
  senderGroupName?: string;
  ipSubType?: BehaviorIPSubType;
  ipAddress?: string;
  ipGroupId?: string;
  ipGroupName?: string;
  domain?: string;
  timeWindow: BehaviorTimeWindow;
  dimensionA: BehaviorDimension;
  thresholdA: number;
  enableOrCondition: boolean;
  dimensionB?: BehaviorDimension;
  thresholdB?: number;
  action: BehaviorProductAction;
  priority: number;
  enabled: boolean;
  createdAt: string;
  modifiedAt: string;
}

interface DemoNamedGroup {
  id: string;
  name: string;
  memberCount: number;
}

// 照抄 demo `MOCK_SENDER_GROUPS` / `MOCK_ORGANIZATIONS` / `MOCK_IP_GROUPS`（仅保留
// 本模块用得到的 id/name/memberCount 字段）。
const BC_SENDER_GROUPS: DemoNamedGroup[] = [
  { id: "sg-1", name: "VIP客户", memberCount: 50 },
  { id: "sg-2", name: "销售团队", memberCount: 120 },
  { id: "sg-3", name: "营销账号", memberCount: 15 },
  { id: "sg-4", name: "系统通知", memberCount: 5 },
  { id: "sg-5", name: "外部供应商", memberCount: 35 },
];

const BC_ORGANIZATIONS: DemoNamedGroup[] = [
  { id: "org-1", name: "销售部", memberCount: 85 },
  { id: "org-2", name: "市场部", memberCount: 42 },
  { id: "org-3", name: "技术部", memberCount: 156 },
  { id: "org-4", name: "人事部", memberCount: 28 },
  { id: "org-5", name: "财务部", memberCount: 35 },
  { id: "org-6", name: "华东区销售", memberCount: 32 },
  { id: "org-7", name: "华南区销售", memberCount: 28 },
];

const BC_IP_GROUPS: DemoNamedGroup[] = [
  { id: "ip-1", name: "海外IP", memberCount: 45 },
  { id: "ip-2", name: "可信代理IP", memberCount: 8 },
  { id: "ip-3", name: "CDN节点", memberCount: 120 },
  { id: "ip-4", name: "VPN出口", memberCount: 5 },
  { id: "ip-5", name: "可疑来源", memberCount: 200 },
];

// 照抄 demo `generateMockRules()`：7 条手工命名规则 + 生成的 #8..#35。
function generateDemoBehaviorRules(): DemoBehaviorRule[] {
  const rules: DemoBehaviorRule[] = [
    // 入站防护规则
    {
      id: "rule-1",
      name: "全局入站IP数量限制",
      direction: "inbound",
      objectType: "global",
      timeWindow: "15min",
      dimensionA: "ip_count",
      thresholdA: 5,
      enableOrCondition: false,
      action: "quarantine",
      priority: 2000,
      enabled: true,
      createdAt: "2024-03-15 10:30",
      modifiedAt: "2024-03-15 10:30",
    },
    {
      id: "rule-2",
      name: "海外IP收信人限制",
      direction: "inbound",
      objectType: "senderIp",
      ipSubType: "ipGroup",
      ipGroupId: "ip-1",
      ipGroupName: "海外IP",
      timeWindow: "day",
      dimensionA: "recipient_count",
      thresholdA: 1000,
      enableOrCondition: false,
      action: "block",
      priority: 2001,
      enabled: true,
      createdAt: "2024-03-14 09:15",
      modifiedAt: "2024-03-14 09:15",
    },
    // 外发防护规则
    {
      id: "rule-3",
      name: "销售团队外发限制",
      direction: "outbound",
      objectType: "sender",
      senderSubType: "group",
      senderGroupId: "sg-2",
      senderGroupName: "销售团队",
      timeWindow: "15min",
      dimensionA: "mail_count",
      thresholdA: 300,
      enableOrCondition: true,
      dimensionB: "recipient_count",
      thresholdB: 600,
      action: "quarantine",
      priority: 2002,
      enabled: true,
      createdAt: "2024-03-13 14:20",
      modifiedAt: "2024-03-13 14:20",
    },
    {
      id: "rule-4",
      name: "个人账号发信限制",
      direction: "outbound",
      objectType: "sender",
      senderSubType: "individual",
      senderEmail: "user@company.com",
      timeWindow: "1hour",
      dimensionA: "mail_count",
      thresholdA: 100,
      enableOrCondition: false,
      action: "drop",
      priority: 2003,
      enabled: true,
      createdAt: "2024-03-12 11:00",
      modifiedAt: "2024-03-12 11:00",
    },
    {
      id: "rule-5",
      name: "VIP客户附件限制",
      direction: "outbound",
      objectType: "sender",
      senderSubType: "group",
      senderGroupId: "sg-1",
      senderGroupName: "VIP客户",
      timeWindow: "day",
      dimensionA: "attachment_size",
      thresholdA: 500,
      enableOrCondition: false,
      action: "review",
      priority: 2004,
      enabled: true,
      createdAt: "2024-03-11 16:45",
      modifiedAt: "2024-03-11 16:45",
    },
    // 域内防护规则
    {
      id: "rule-6",
      name: "域内全局发信限制",
      direction: "internal",
      objectType: "global",
      timeWindow: "15min",
      dimensionA: "mail_count",
      thresholdA: 500,
      enableOrCondition: false,
      action: "quarantine",
      priority: 2010,
      enabled: true,
      createdAt: "2024-03-10 08:30",
      modifiedAt: "2024-03-10 08:30",
    },
    // 双向合计规则
    {
      id: "rule-7",
      name: "双向合计发信限制",
      direction: "bidirectional",
      objectType: "global",
      timeWindow: "day",
      dimensionA: "mail_count",
      thresholdA: 2000,
      enableOrCondition: true,
      dimensionB: "recipient_count",
      thresholdB: 5000,
      action: "block",
      priority: 2020,
      enabled: true,
      createdAt: "2024-03-09 15:00",
      modifiedAt: "2024-03-09 15:00",
    },
  ];

  // 生成更多规则用于分页演示（混合不同方向）。
  const directions: BehaviorDirection[] = [
    "inbound",
    "outbound",
    "internal",
    "bidirectional",
  ];
  for (let i = 8; i <= 35; i++) {
    rules.push({
      id: `rule-${i}`,
      name: `行为规则 #${i}`,
      direction: directions[i % 4],
      objectType:
        i % 4 === 0
          ? "global"
          : i % 4 === 1
            ? "sender"
            : i % 4 === 2
              ? "senderIp"
              : "senderDomain",
      senderSubType: i % 3 === 0 ? "individual" : "group",
      senderEmail: i % 3 === 0 ? `user${i}@company.com` : undefined,
      senderGroupId: i % 3 !== 0 ? `sg-${(i % 5) + 1}` : undefined,
      senderGroupName: i % 3 !== 0 ? BC_SENDER_GROUPS[i % 5].name : undefined,
      ipSubType: i % 4 === 2 ? (i % 2 === 0 ? "single" : "ipGroup") : undefined,
      ipAddress: i % 4 === 2 && i % 2 === 0 ? `192.168.${i}.0/24` : undefined,
      ipGroupId: i % 4 === 2 && i % 2 !== 0 ? `ip-${(i % 5) + 1}` : undefined,
      ipGroupName:
        i % 4 === 2 && i % 2 !== 0 ? BC_IP_GROUPS[i % 5].name : undefined,
      domain: i % 4 === 3 ? `domain${i}.com` : undefined,
      timeWindow: (["15min", "1hour", "day"] as const)[i % 3],
      dimensionA: (
        [
          "ip_count",
          "recipient_count",
          "mail_count",
          "attachment_size",
        ] as const
      )[i % 4],
      thresholdA: 50 + i * 10,
      enableOrCondition: i % 3 === 0,
      dimensionB: i % 3 === 0 ? "recipient_count" : undefined,
      thresholdB: i % 3 === 0 ? 100 + i * 5 : undefined,
      action: (["review", "quarantine", "drop", "block"] as const)[i % 4],
      priority: 2000 + i,
      enabled: i % 5 !== 0,
      createdAt: `2024-03-${String(28 - (i % 28)).padStart(2, "0")} ${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
      modifiedAt: `2024-03-${String(28 - (i % 28)).padStart(2, "0")} ${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
    });
  }

  return rules;
}

const BEHAVIOR_CONTROL_DEMO_RULES: DemoBehaviorRule[] =
  generateDemoBehaviorRules();

// object_config 映射：individual→senderEmail，group→senderGroupName，
// senderIp/single→ipAddress，senderIp/ipGroup→ipGroupName，
// senderDomain→domain，global→{type:'global'}。
// 群组/IP群组用「名称」而非 id 作为 value —— 与真实抽屉一致（下拉 SelectItem
// value=群组名），也让表格直接显示 demo 的名称（海外IP/VIP客户/销售团队）。
function behaviorObjectConfig(
  d: DemoBehaviorRule,
): BehaviorControlObjectConfig {
  switch (d.objectType) {
    case "global":
      return { type: "global" };
    case "sender":
      if (d.senderSubType === "individual") {
        return { type: "sender", sub_type: "individual", value: d.senderEmail };
      }
      return { type: "sender", sub_type: "group", value: d.senderGroupName };
    case "senderIp":
      if (d.ipSubType === "single") {
        return { type: "senderIp", sub_type: "single", value: d.ipAddress };
      }
      return { type: "senderIp", sub_type: "ipGroup", value: d.ipGroupName };
    case "senderDomain":
      return { type: "senderDomain", value: d.domain };
  }
}

function toBehaviorControlRule(d: DemoBehaviorRule): Rule {
  const meta: BehaviorControlMetadata = {
    feature: "behavior_control",
    direction: d.direction,
    object_config: behaviorObjectConfig(d),
    time_window: d.timeWindow,
    dim_a: d.dimensionA,
    threshold_a: d.thresholdA,
    or_enabled: d.enableOrCondition,
    dim_b: d.enableOrCondition ? d.dimensionB : undefined,
    threshold_b: d.enableOrCondition ? d.thresholdB : undefined,
  };
  return {
    id: Number(d.id.replace("rule-", "")),
    name: d.name,
    rule_class: "action",
    stage: "rcpt",
    page: "behavior_control",
    priority: d.priority,
    condition_tree: "{}",
    action: PRODUCT_TO_BACKEND[d.action],
    is_active: d.enabled,
    tags: [],
    metadata: JSON.stringify(meta),
    created_at: d.createdAt,
    updated_at: d.modifiedAt,
  };
}

export function mockBehaviorControlRulesList(): { items: Rule[] } {
  return { items: BEHAVIOR_CONTROL_DEMO_RULES.map(toBehaviorControlRule) };
}

// 默认值照抄 demo renderRecipientCheckConfig 硬编码：接收 30/仅本域/阻断，
// 外发 50/审核，域内 20/隔离，合并 50/审核，数量限制默认开启。
export function mockRecipientLimitConfig(): RecipientLimitConfig {
  return {
    mode: "detailed",
    is_active: true,
    inbound_limit: { limit: 30, scope: "local", action: "reject" },
    outbound_limit: { limit: 50, scope: "all", action: "audit" },
    internal_limit: { limit: 20, scope: "local", action: "quarantine" },
    merged_limit: { limit: 50, action: "audit" },
  };
}

// 收信人检测模块级 + 存在���验证配置（demo：模块开、存在性开、失败动作 阻断）。
export function mockRecipientCheckConfig(): RecipientCheckConfig {
  return {
    existence_enabled: true,
    existence_action: "reject",
  };
}

// 发信人/IP/组织群组下拉（behavior-control 抽屉里的群组选择器，见
// `BehaviorControlDrawer.tsx` 的 `groupsQuery`）。三类群组用 `metadata.group_type`
// 区分（'sender' | 'ip' | 'org'，注�� 'org' 不是通用 `GroupType`
// （src/types/groups.ts）的成员）；抽屉自己按 `metadata.group_type` 过滤、直接读
// `name` 字段展示，不经过 `tags`。
//
// tag 用 `grp:<demoId>`（对齐 brief）。这批群组和 sender_filter 的群组
// （`mockSenderFilterGroupsList`）虽然都命中 `page=<GROUPS_PAGE_KEY>`，但 dispatcher
// 用 `include` 参数把两者分流（behavior-control 抽屉��� `include=member_count`，
// sender_filter 发 `include=member_count,reference_count`），互不污染，因此这里可以
// 安全沿用通用的 'grp:' 前缀。
function behaviorGroupRule(o: {
  id: number;
  name: string;
  groupType: "sender" | "ip" | "org";
  memberCount: number;
  demoId: string;
}): Rule {
  return {
    id: o.id,
    name: o.name,
    rule_class: "tag",
    stage: "rcpt",
    priority: 100,
    condition_tree: "{}",
    is_active: true,
    tags: ["grp:" + o.demoId],
    metadata: JSON.stringify({
      group_type: o.groupType,
      member_count: o.memberCount,
    }),
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export function mockBehaviorControlGroupsList(): { items: Rule[] } {
  const senderItems = BC_SENDER_GROUPS.map((g, i) =>
    behaviorGroupRule({
      id: 201 + i,
      name: g.name,
      groupType: "sender",
      memberCount: g.memberCount,
      demoId: g.id,
    }),
  );
  const ipItems = BC_IP_GROUPS.map((g, i) =>
    behaviorGroupRule({
      id: 301 + i,
      name: g.name,
      groupType: "ip",
      memberCount: g.memberCount,
      demoId: g.id,
    }),
  );
  const orgItems = BC_ORGANIZATIONS.map((g, i) =>
    behaviorGroupRule({
      id: 401 + i,
      name: g.name,
      groupType: "org",
      memberCount: g.memberCount,
      demoId: g.id,
    }),
  );
  return { items: [...senderItems, ...ipItems, ...orgItems] };
}

// ════════════════════════════════════════════════════════════════════════════════
// 用户黑白名单（user_list，mock）
// 与 demo `generateUserBlacklistRules()`/`generateUserWhitelistRules()`
// （design/origin/demo/components/filter-rules-new/identity-strategy-page.tsx）
// 逐字段对齐，供 resolveUserListRule（src/lib/api/user-list.ts）解析回展示 ID/
// sender/recipient/createdBy。sender/recipient 均存字面值（含 `*@…`）——
// mock 只需与 demo 展示对齐，*@domain / 收信人组的真实匹配语义是 Phase 2 后端职责。
// ════════════════════════════════════════════════════════════════════════════════

function ulRule(o: {
  id: number;
  sender: string;
  recipient: string;
  action: "reject" | "quarantine" | "accept";
  is_active: boolean;
  created_at: string;
  createdBy: string;
  list_type: "blacklist" | "whitelist";
}): Rule {
  const ct = {
    type: "AND",
    children: [
      { type: "condition", field: "sender", operator: "eq", value: o.sender },
      {
        type: "condition",
        field: "onercpt",
        operator: "eq",
        value: o.recipient,
      },
    ],
  };
  return {
    id: o.id,
    name: `ul-${o.id}`,
    rule_class: "action",
    stage: "rcpt",
    priority: o.list_type === "whitelist" ? 2800 : 2000,
    condition_tree: JSON.stringify(ct),
    action: o.action,
    is_active: o.is_active,
    tags: [],
    metadata: JSON.stringify({
      feature: "user_list",
      owner: o.createdBy,
      source: "admin",
      list_type: o.list_type,
    }),
    created_at: o.created_at,
    updated_at: o.created_at,
  };
}

// 21 条黑名单（20 demo + 1 D-006 block/reject 行覆盖红 badge）+ 15 条白名单 = 36 条。
export function mockUserListRulesList(): { items: Rule[] } {
  const bl: Rule[] = [];
  // 前5行照抄 demo 硬编码
  const seed = [
    [
      "spam@bad-actor.com",
      "alice@company.com",
      true,
      "admin@company.com",
      "2026-03-20T10:30:00Z",
    ],
    [
      "*@promo-blast.net",
      "bob@company.com",
      true,
      "admin@company.com",
      "2026-03-19T14:15:00Z",
    ],
    [
      "ads@newsletter.io",
      "*@sales.company.com",
      false,
      "admin@company.com",
      "2026-03-18T09:00:00Z",
    ],
    [
      "marketing@spam.org",
      "charlie@company.com",
      true,
      "security@company.com",
      "2026-03-17T15:49:00Z",
    ],
    [
      "*@junk-mail.com",
      "*@company.com",
      true,
      "admin@company.com",
      "2026-03-16T14:42:00Z",
    ],
  ] as const;
  seed.forEach((s, i) =>
    bl.push(
      ulRule({
        id: i + 1,
        sender: s[0],
        recipient: s[1],
        action: "quarantine",
        is_active: s[2] as boolean,
        createdBy: s[3] as string,
        created_at: s[4] as string,
        list_type: "blacklist",
      }),
    ),
  );
  // 6..20 照抄 demo 规律（全 quarantine）
  for (let i = 6; i <= 20; i++)
    bl.push(
      ulRule({
        id: i,
        sender: `sender${i}@spam-domain${i % 5}.com`,
        recipient:
          i % 3 === 0 ? `*@dept${i % 5}.company.com` : `user${i}@company.com`,
        action: "quarantine",
        is_active: i % 4 !== 0,
        createdBy: i % 2 === 0 ? "admin@company.com" : "security@company.com",
        created_at: `2026-03-${String(21 - (i % 15)).padStart(2, "0")}T09:00:00Z`,
        list_type: "blacklist",
      }),
    );
  // D-006：额外 1 条 block(reject) 行覆盖红 badge
  bl.push(
    ulRule({
      id: 21,
      sender: "attacker@evil.com",
      recipient: "ceo@company.com",
      action: "reject",
      is_active: true,
      createdBy: "security@company.com",
      created_at: "2026-03-15T08:00:00Z",
      list_type: "blacklist",
    }),
  );
  const wl: Rule[] = [];
  const wseed = [
    [
      "support@trusted.com",
      "alice@company.com",
      "admin@company.com",
      "2026-03-20T08:45:00Z",
    ],
    [
      "*@partner-corp.com",
      "*@company.com",
      "admin@company.com",
      "2026-03-19T16:20:00Z",
    ],
    [
      "vip@important.com",
      "bob@company.com",
      "security@company.com",
      "2026-03-18T10:30:00Z",
    ],
  ] as const;
  wseed.forEach((s, i) =>
    wl.push(
      ulRule({
        id: i + 1,
        sender: s[0],
        recipient: s[1],
        action: "accept",
        is_active: true,
        createdBy: s[2] as string,
        created_at: s[3] as string,
        list_type: "whitelist",
      }),
    ),
  );
  for (let i = 4; i <= 15; i++)
    wl.push(
      ulRule({
        id: i,
        sender: `contact${i}@trusted-domain${i % 3}.com`,
        recipient:
          i % 2 === 0 ? `*@dept${i % 4}.company.com` : `staff${i}@company.com`,
        action: "accept",
        is_active: i % 5 !== 0,
        createdBy: i % 3 === 0 ? "security@company.com" : "admin@company.com",
        created_at: `2026-03-${String(21 - (i % 15)).padStart(2, "0")}T09:00:00Z`,
        list_type: "whitelist",
      }),
    );
  return { items: [...bl, ...wl] };
}

// ─── URL检测与防护（url-protection，mock）──────────────────��─────────────
// 数据源：demo components/filter-rules-new/url-protection-module.tsx 的
// createDefaultUrlProtectionConfig / createDefaultLinkProtectionConfig 默认值。
// public_base_url 预置一个占位主机名（链接保护生效需模块统一开关 + master switch + base URL）。
let urlProtectionSettingsState: Record<string, unknown> = {
  tenant_id: 7,
  public_base_url: "https://gw.example-tenant.com",
  sandbox_config: JSON.stringify({
    receive: {
      enabled: true,
      malicious_action: "isolate",
      timeout_action: "continue",
      local_intel_enabled: true,
      intel_cleanup_days: 180,
      cloud_intel_enabled: true,
    },
  }),
  rescan_blacklist: true,
  rescan_query_intel: true,
  rescan_deep_inspect: false,
  deep_inspect_timeout_sec: 60,
  deep_inspect_timeout_policy: "block",
  allow_user_skip_deep_inspect: false,
};

export function mockURLProtectionSettings(): Record<string, unknown> {
  return { ...urlProtectionSettingsState };
}

export function mockPutURLProtectionSettings(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  urlProtectionSettingsState = { ...urlProtectionSettingsState, ...patch };
  return { ...urlProtectionSettingsState };
}

// ─── 意图引擎（intent-engine，mock）────────────────────────────────
// 数据源：demo intent-engine-module.tsx createDefaultIntentEngineConfig()，
// 动��映射后端枚举（mark_deliver→accept、review→audit、block→reject、drop→discard），
// 非 receive 方向默认区间 accept→quarantine（D-06）。
// 常量从 @/types/intent-engine 导入（INTENT_TYPES、RISK_LEVEL_OF���DEFAULT_MARK_TEXT、createDefaultMarkConfig）。

function intentMockSegments(risk: "high" | "medium" | "low", dir: string) {
  const acc = dir === "receive" ? "accept" : "quarantine";
  if (risk === "high") {
    return [
      { min: 0, max: 0.3, action: "audit" },
      { min: 0.3, max: 0.6, action: "quarantine" },
      { min: 0.6, max: 1, action: "discard" },
    ];
  }
  if (risk === "medium") {
    return [
      { min: 0, max: 0.2, action: acc },
      { min: 0.2, max: 0.6, action: "quarantine" },
      { min: 0.6, max: 1, action: "discard" },
    ];
  }
  return [
    { min: 0, max: 0.5, action: acc },
    { min: 0.5, max: 0.8, action: "quarantine" },
    { min: 0.8, max: 1, action: "audit" },
  ];
}

function intentMockSingle(it: string, dir: string) {
  const risk = RISK_LEVEL_OF[it as IntentType];
  const isReceive = dir === "receive";
  let action: string;
  if (risk === "high") action = isReceive ? "quarantine" : "discard";
  else if (risk === "medium") action = isReceive ? "quarantine" : "audit";
  else action = isReceive ? "accept" : "audit";
  const segments = intentMockSegments(risk, dir);
  const cfg: Record<string, unknown> = {
    enabled: true,
    action,
    detection_mode: "classification",
    threshold_segments: segments,
  };
  // mark_config 是分类级别的单一配置，切到分段阈值模式时也可能用到（只要
  // 有区间动作是 accept），所以只看顶层 action 会漏掉「分类动作非 accept，
  // 但阈值区间里有 accept」的组合——按两者的并集判断，避免用户切到阈值模式
  // 却看不到已配置好的标记面板。
  const hasAcceptSegment = segments.some((s) => s.action === "accept");
  if (action === "accept" || hasAcceptSegment) {
    cfg.mark_config = createDefaultMarkConfig(it as IntentType);
  }
  return cfg;
}

function buildIntentEngineDefaults() {
  const dir = (d: string) =>
    Object.fromEntries(INTENT_TYPES.map((it) => [it, intentMockSingle(it, d)]));
  return {
    engine_enabled: { receive: true, send: true, internal: true },
    directions: {
      receive: dir("receive"),
      send: dir("send"),
      internal: dir("internal"),
    },
  };
}

let intentEngineMockState: Record<string, unknown> | null = null;

export function mockIntentEngineConfig(): Record<string, unknown> {
  if (!intentEngineMockState)
    intentEngineMockState = buildIntentEngineDefaults();
  return structuredClone(intentEngineMockState);
}

export function mockPutIntentEngineConfig(
  body: Record<string, unknown>,
): Record<string, unknown> {
  intentEngineMockState = structuredClone(body);
  // 与 spec §5 对齐：PUT 覆写内存态后返回覆写后的配置（而不是 {ok:true}），
  // 使前端 putIntentEngineConfig 的返回值可直接用于回填页面状态。
  return structuredClone(intentEngineMockState);
}

// ─── 相似检测（similar-detection，mock）────────────────────────────────
// 数据源：T7 defaults.ts 的 defaultConfig()（逐字段等于 Go
// DefaultSimilarDetectionConfig 的 demo 运行态默认值），version 固定为 3
// （非 0，便于测试乐观锁 expected_version 传递）。

export const mockSimilarDetectionConfig: SimilarDetectionConfig = {
  ...defaultSimilarDetectionConfig(),
  version: 3,
};

let similarDetectionMockState: SimilarDetectionConfig | null = null;

export function getSimilarDetectionMockState(): SimilarDetectionConfig {
  if (!similarDetectionMockState)
    similarDetectionMockState = structuredClone(mockSimilarDetectionConfig);
  return structuredClone(similarDetectionMockState);
}

export function putSimilarDetectionMockState(
  body: Partial<SimilarDetectionConfig> & { expected_version?: number },
): SimilarDetectionConfig {
  const current = getSimilarDetectionMockState();
  const nextVersion =
    body.expected_version != null ? body.expected_version + 1 : 4;
  similarDetectionMockState = {
    ...current,
    ...structuredClone(body),
    version: nextVersion,
  };
  return structuredClone(similarDetectionMockState);
}

// ─── 附件安全检测（attachment-security，mock）──────────────────────────���───
// 数据源：demo attachment-security-module.tsx 与对应 html_spec 的浏览器实测默认��。
// config_overrides 采���与真实 API 相同的逐键结构，使统一保存逻辑在 Mock 模式下
// 也会真实执行 GET → POST/PUT → GET，而不是绕过数据映射。
export interface MockAttachmentConfigOverride {
  id: number;
  config_file: "attachd.cf";
  section_name: string;
  config_key: string;
  config_value: string;
  value_type: "string" | "int" | "float" | "bool";
  is_active: boolean;
  description: string;
}

let nextAttachmentConfigID = 9000;

function configValueType(
  value: unknown,
): MockAttachmentConfigOverride["value_type"] {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "float";
  return "string";
}

function attachmentConfigSeed(
  section: string,
  values: Record<string, unknown>,
): MockAttachmentConfigOverride[] {
  return Object.entries(values).map(([key, value]) => ({
    id: nextAttachmentConfigID++,
    config_file: "attachd.cf",
    section_name: section,
    config_key: key,
    config_value: String(value),
    value_type: configValueType(value),
    is_active: true,
    description: "Mock fixture from attachment-security html_spec",
  }));
}

const mockAttachmentConfigOverrides: MockAttachmentConfigOverride[] = [
  ...attachmentConfigSeed("basic_limit_receive", {
    attachment_count_max: 10,
    attachment_size_max_kb: 10240,
    nested_zip_count_max: 2,
    nested_file_count_max: 20,
    nested_level_max: 2,
    scan_timeout_sec: 30,
    exceed_action: "quarantine",
    partial_skip: false,
    danger_ext_enabled: true,
    danger_ext_list:
      ".exe,.scr,.com,.bat,.cmd,.pif,.vbs,.js,.jse,.ws,.wsh,.hta,.lnk,.iso,.img,.vhd,.ps1,.psm1,.msi",
    mime_mismatch_check: true,
  }),
  ...attachmentConfigSeed("antivirus", { host: "av-server", port: "6600" }),
  ...attachmentConfigSeed("antivirus_actions_receive", {
    virus_action: "quarantine",
    timeout_action: "accept",
  }),
  ...attachmentConfigSeed("image_detect", {
    ocr_mode: "light",
    ocr_max_count: 2,
    qr_mode: "light",
    qr_max_count: 5,
  }),
  ...attachmentConfigSeed("image_detect_qr_deep_routes", {
    url_check: true,
    url_unshorten: true,
    keyword_filter: true,
    keyword_scope: "url_path,plain_text",
    intent_engine: true,
    intent_categories: "high,medium,low",
    advanced_rules: false,
  }),
  ...attachmentConfigSeed("image_detect_actions_receive", {
    qr_light_action: "quarantine",
    qr_deep_exceed_action: "accept",
    qr_deep_exceed_warn: true,
  }),
  ...attachmentConfigSeed("encrypted", {
    detect_mode: "detect_only",
    extract_password_from_body: true,
    extract_password_from_filename: true,
    use_password_book: true,
    recursive_detect: true,
    max_password_attempts: 100,
    mark_suspicious: true,
  }),
  ...attachmentConfigSeed("encrypted_actions_receive", {
    decrypt_fail_action: "accept",
  }),
];

export function mockAttachmentConfigList(path: string) {
  const query = new URLSearchParams(path.split("?")[1] ?? "");
  const section = query.get("section_name");
  const items = mockAttachmentConfigOverrides.filter(
    (item) => !section || item.section_name === section,
  );
  return {
    total: items.length,
    page: 1,
    limit: 200,
    items: structuredClone(items),
  };
}

export function mockCreateAttachmentConfig(
  body: Partial<MockAttachmentConfigOverride>,
) {
  const item: MockAttachmentConfigOverride = {
    id: nextAttachmentConfigID++,
    config_file: "attachd.cf",
    section_name: body.section_name ?? "",
    config_key: body.config_key ?? "",
    config_value: body.config_value ?? "",
    value_type: body.value_type ?? "string",
    is_active: true,
    description: body.description ?? "Mock attachment-security override",
  };
  mockAttachmentConfigOverrides.push(item);
  return structuredClone(item);
}

export function mockUpdateAttachmentConfig(
  id: number,
  body: Partial<MockAttachmentConfigOverride>,
) {
  const item = mockAttachmentConfigOverrides.find((entry) => entry.id === id);
  if (!item) return null;
  Object.assign(item, body);
  return structuredClone(item);
}

interface MockPasswordBookEntry {
  id: number;
  password: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

let nextAttachmentPasswordID = 2;
const mockAttachmentPasswords: MockPasswordBookEntry[] = [
  {
    id: 1,
    password: "company2024!",
    description: null,
    created_by: "admin",
    created_at: "2024-01-15T00:00:00+08:00",
  },
];

export function mockAttachmentPasswordList() {
  return structuredClone(mockAttachmentPasswords);
}

export function mockAddAttachmentPassword(body: {
  password?: string;
  description?: string | null;
}) {
  const entry: MockPasswordBookEntry = {
    id: nextAttachmentPasswordID++,
    password: body.password ?? "",
    description: body.description ?? null,
    created_by: "admin",
    created_at: new Date().toISOString(),
  };
  mockAttachmentPasswords.push(entry);
  return structuredClone(entry);
}

export function mockDeleteAttachmentPassword(id: number) {
  const index = mockAttachmentPasswords.findIndex((entry) => entry.id === id);
  if (index >= 0) mockAttachmentPasswords.splice(index, 1);
}

// ═══════════════��════════════════════════════════════════════════════════════════
// 邮件处置中心（email-handling-disposal-center，mock）
// 25 条数据逐项来自 html_spec 对应 demo 的 LogItem fixture。这里保留 demo
// 的业务语义，再转换成 webapp 真实 `/mail-logs` API 的字段形状，避���页面
// 为 mock 引入第二套数据模型。
// ════════════════════════════════════════════════════════════════════════════════

interface MockDisposalSeed {
  tid: string;
  time: string;
  direction: "incoming" | "outgoing";
  sender: string;
  recipients: string;
  subject: string;
  action: "quarantine" | "block" | "discard" | "deliver" | "mixed";
  reason: string;
  mailType: string;
  deliveryStatus: string;
  sourceIp: string;
  ipLocation: string;
  cluster: string;
  attachmentCount: number;
  hasQrCode: boolean;
  score: number;
  basis?: [string, string, string];
  finalType?: string;
  correctionSource?: string;
  // domainAgeDays -- 命中特征「域名���龄」badge 的 mock 值（新注册域名信号，
  // deriveDomainAge() 只在存在且 <=7 天时渲染）。缺省 undefined����即真实后端
  // 现状（暂无 whois/RDAP 数据）的优雅降级。
  domainAgeDays?: number;
  // senderIsNewOnThisMail -- true 时该行的 sender_first_seen_at 等于自己的
  // received_at（首次出现新发信人场景），否则沿用既有的固定历史值（已知
  // 发信人场景）。
  senderIsNewOnThisMail?: boolean;
  // storageSizeBytes -- 覆盖默认按 index 递增的 storage_size 演算值，用于对齐
  // demo 展示的具体大小（如「大小: 2.3MB」）。
  storageSizeBytes?: number;
  // disposalBasisActionOverride -- 仅覆盖 disposal_basis.action 这一个展示
  // 字段（处置依据摘要的动作徽标），不改变邮件真正的 action/deliveryStatus/
  // recipient_dispositions 等派发状态（those stay driven by action+
  // deliveryStatus as before -- 本任务明确不touch dispatch逻辑）。
  disposalBasisActionOverride?: string;
  // isMixed -- 标记这封邮件是多收件人混合处置（action='mixed'），mockMailLog
  // 据此生成 disposition_actions + 逐收件人 final_action 各异的 dispositions。
  isMixed?: boolean;
}

const MOCK_DISPOSAL_SEEDS: MockDisposalSeed[] = [
  {
    tid: "MIC001",
    time: "2026-05-29 10:30:45",
    direction: "incoming",
    sender: "ceo-fake@company-security.com",
    recipients:
      "finance@company.com, hr@company.com, admin@company.com, user1@company.com, user2@company.com",
    subject: "Q2财务报表 - 紧急审批（多投信）",
    action: "quarantine",
    reason: "仿冒邮件检测命中",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "203.0.113.45",
    ipLocation: "美国",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 94,
    basis: ["AI-SPOOF", "高管仿冒识别", "AI-SPOOF-012"],
  },
  {
    tid: "MIC053",
    time: "2026-06-15 09:30:00",
    direction: "incoming",
    sender: "bulk-sender@marketing-external.com",
    recipients:
      "alice@company.com, bob@company.com, carol@company.com, dave@company.com, eve@company.com, frank@company.com, grace@company.com, henry@company.com",
    subject: "季度营销报告 - 部分收件人白名单（混合处置演示）",
    // 种子里记规则命中的那一半处置；整封的 action='mixed' 由下面的 isMixed
    // 派生（mockMailLog 的 `seed.isMixed ? "mixed" : disposalAction(seed)`），
    // 不能直接写进 action —— MockDisposalSeed.action 是逐收件人的基础处置。
    action: "quarantine",
    reason: "混合处置：白名单收件人投递 + 规则命中隔离",
    mailType: "normal",
    deliveryStatus: "partial_delivered",
    sourceIp: "45.137.21.88",
    ipLocation: "新加坡",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 35,
    basis: ["CONTENT", "内容关键字匹配", "CT-007"],
    isMixed: true,
  },
  {
    tid: "MIC002",
    time: "2026-05-29 11:15:20",
    direction: "incoming",
    sender: "ceo@company-corp.com",
    recipients: "hr@company.com",
    subject: "紧急：员工名单确认（单投信）",
    action: "quarantine",
    reason: "高管仿冒AI检测触发",
    mailType: "phishing",
    deliveryStatus: "audit_pending",
    sourceIp: "88.99.11.22",
    ipLocation: "荷兰",
    cluster: "Node 1",
    attachmentCount: 2,
    hasQrCode: false,
    score: 91,
    basis: ["AI-PHISH", "BEC钓鱼识别", "AI-PHISH-003"],
    // demo html_spec layer-10-detail-overview-single 对齐：首次出现新发信人 +
    // 域名年龄2天（新注册域名）+ 处置依据展示为「隔离」（而不是
    // deliveryStatus=audit_pending 派生出的「审核」，两者是独立字段——见
    // MockDisposalSeed.disposalBasisActionOverride 的注释）+ 大小≈2.3MB。
    senderIsNewOnThisMail: true,
    domainAgeDays: 2,
    storageSizeBytes: 2_411_724,
    disposalBasisActionOverride: "quarantine",
  },
  {
    tid: "MIC003",
    time: "2026-05-29 09:45:30",
    direction: "incoming",
    sender: "support@bank-verify.com",
    recipients: "user@company.com, sales@company.com, marketing@company.com",
    subject: "账户安全验���通知（多投信）",
    action: "block",
    reason: "AI-URL沙箱检测到钓鱼页面",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "192.168.1.100",
    ipLocation: "俄罗斯",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: true,
    score: 88,
    basis: ["URL", "恶意链接沙箱检测", "URL-021"],
  },
  {
    tid: "MIC004",
    time: "2026-05-29 08:20:15",
    direction: "incoming",
    sender: "invoice@supplier-fake.com",
    recipients: "admin@company.com",
    subject: "发票文档（单投信）",
    action: "discard",
    reason: "命中恶意附件哈希黑名单",
    mailType: "virus",
    deliveryStatus: "discarded",
    sourceIp: "203.45.67.89",
    ipLocation: "乌克兰",
    cluster: "Node 2",
    attachmentCount: 1,
    hasQrCode: false,
    score: 99,
    basis: ["ATT-AV", "病毒附件拦截", "ATT-AV-005"],
  },
  {
    tid: "MIC005",
    time: "2026-05-29 14:30:00",
    direction: "incoming",
    sender: "partner@business.com",
    recipients: "manager@company.com",
    subject: "合作项目会议纪要（单投信）",
    action: "deliver",
    reason: "所有检测通过",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "42.120.33.44",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 8,
  },
  {
    tid: "MIC006",
    time: "2026-05-29 13:15:45",
    direction: "incoming",
    sender: "newsletter@marketing.com",
    recipients:
      "user@company.com, sales1@company.com, sales2@company.com, marketing@company.com, dev@company.com, ops@company.com, support@company.com, intern@company.com",
    subject: "本周特惠活动（多投信 - 8人）",
    action: "deliver",
    reason: "垃圾邮件标记投递",
    mailType: "spam",
    finalType: "normal",
    correctionSource: "user_recall",
    deliveryStatus: "delivered",
    sourceIp: "10.0.0.1",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 35,
  },
  {
    tid: "MIC007",
    time: "2026-05-29 07:45:00",
    direction: "incoming",
    sender: "unknown@external.com",
    recipients: "user@company.com",
    subject: "(传输中断)（单投信）",
    action: "quarantine",
    reason: "DATA阶段连接中断",
    mailType: "normal",
    deliveryStatus: "delivery_failed",
    sourceIp: "123.45.67.88",
    ipLocation: "印度",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 50,
  },
  {
    tid: "MIC008",
    time: "2026-05-29 15:00:00",
    direction: "outgoing",
    sender: "sales@company.com",
    recipients: "client@customer.com, partner@vendor.com",
    subject: "产品报价单（多投信）",
    action: "deliver",
    reason: "账号安全检查通过",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.5.88",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 5,
  },
  {
    tid: "MIC009",
    time: "2026-05-29 06:30:00",
    direction: "incoming",
    sender: "ransom@darkweb-mail.com",
    recipients: "it@company.com",
    subject: "重要系统更新（单投信）",
    action: "discard",
    reason: "检测到勒索软件特征",
    mailType: "virus",
    deliveryStatus: "discarded",
    sourceIp: "185.220.100.243",
    ipLocation: "德国",
    cluster: "Node 2",
    attachmentCount: 1,
    hasQrCode: false,
    score: 99,
    basis: ["ATT-AV", "勒索软件拦截", "ATT-AV-018"],
  },
  {
    tid: "MIC010",
    time: "2026-05-29 12:00:00",
    direction: "incoming",
    sender: "security@microsoft-verify.com",
    recipients:
      "employee1@company.com, employee2@company.com, employee3@company.com, employee4@company.com",
    subject: "MFA验证更新通知（多投信 - 4人）",
    action: "quarantine",
    reason: "二维码指向钓鱼页面",
    mailType: "phishing",
    finalType: "normal",
    correctionSource: "admin_release",
    deliveryStatus: "delivered",
    sourceIp: "45.77.88.99",
    ipLocation: "新加坡",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: true,
    score: 85,
    basis: ["ATT-QR", "二维码钓鱼检测", "ATT-QR-007"],
  },
  {
    tid: "MIC011",
    time: "2026-05-29 16:45:00",
    direction: "outgoing",
    sender: "employee@company.com",
    recipients: "personal@gmail.com",
    subject: "客户名单备份（单投信）",
    action: "block",
    reason: "DLP策略命中：敏感数据外发",
    mailType: "sensitive",
    deliveryStatus: "rejected",
    sourceIp: "10.0.10.55",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 75,
    basis: ["CR", "客户数据外发管控", "CR-045"],
  },
  {
    tid: "MIC012",
    time: "2026-05-29 17:30:00",
    direction: "incoming",
    sender: "support@vendor-portal.net",
    recipients: "procurement@company.com",
    subject: "供应商门户密码重置（单投信）",
    action: "quarantine",
    reason: "发件人域名风险评分异常",
    mailType: "suspicious",
    deliveryStatus: "audit_pending",
    sourceIp: "104.21.33.77",
    ipLocation: "美国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 62,
    basis: ["AUTH", "相似域名仿冒检测", "AUTH-033"],
  },
  {
    tid: "MIC013",
    time: "2026-05-29 18:00:00",
    direction: "outgoing",
    sender: "user@company.com",
    recipients:
      "victim1@external.com, victim2@external.com, victim3@external.com, victim4@external.com, victim5@external.com, victim6@external.com, victim7@external.com, victim8@external.com, victim9@external.com, victim10@external.com",
    subject: "紧急通知（多投信 - 10人）",
    action: "block",
    reason: "账号安全检测：异常批量外发",
    mailType: "account_compromised",
    deliveryStatus: "rejected",
    sourceIp: "10.0.8.22",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 80,
    basis: ["BEHAVIOR", "异常批量外发管控", "BEHAVIOR-009"],
  },
  {
    tid: "MIC014",
    time: "2026-05-29 19:00:00",
    direction: "incoming",
    sender: "client@customer.com",
    recipients: "sales@company.com",
    subject: "Re: 产品报价单（单投信）",
    action: "deliver",
    reason: "所有检测通过",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "61.135.169.121",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 3,
  },
  {
    tid: "MIC015",
    time: "2026-05-29 20:15:00",
    direction: "incoming",
    sender: "notifications@social-platform.com",
    recipients:
      "user1@company.com, user2@company.com, user3@company.com, user4@company.com, user5@company.com, user6@company.com",
    subject: "您有新的消息通知（���投信 - 6人）",
    action: "deliver",
    reason: "灰邮件标记投递",
    mailType: "advertising",
    deliveryStatus: "partial_delivered",
    sourceIp: "157.240.1.35",
    ipLocation: "美国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 25,
  },
  {
    tid: "MIC016",
    time: "2026-06-08 14:23:16",
    direction: "incoming",
    sender: "service@cacter-fake.com",
    recipients: "user1@company.com",
    subject: "您的账户存在异常登录，请立即验证（单投信）",
    action: "quarantine",
    reason: "钓鱼邮件检测智能体命中",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "45.146.26.18",
    ipLocation: "美国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 92,
    basis: ["AI-PHISH", "钓鱼邮件智能识别", "AI-PHISH-021"],
  },
  {
    tid: "MIC017",
    time: "2026-06-09 09:12:00",
    direction: "outgoing",
    sender: "sales@company.com",
    recipients: "external-buyer@outlook.com",
    subject: "Q2 大客户联系人清单",
    action: "block",
    reason: "内容规则命中：客户数据外发",
    mailType: "sensitive",
    deliveryStatus: "rejected",
    sourceIp: "10.0.10.62",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 78,
    basis: ["CR", "客户数据外发管控", "CR-045"],
  },
  {
    tid: "MIC018",
    time: "2026-06-09 10:05:00",
    direction: "outgoing",
    sender: "hr@company.com",
    recipients: "candidate@gmail.com",
    subject: "在职员工薪资表（误发）",
    action: "block",
    reason: "内容规则命中：客户数据外发",
    mailType: "sensitive",
    deliveryStatus: "rejected",
    sourceIp: "10.0.10.71",
    ipLocation: "中国",
    cluster: "Node 2",
    attachmentCount: 1,
    hasQrCode: false,
    score: 80,
    basis: ["CR", "客户数据外发管控", "CR-045"],
  },
  {
    tid: "MIC019",
    time: "2026-06-09 11:20:00",
    direction: "incoming",
    sender: "promo@loan-fast.cn",
    recipients: "user2@company.com",
    subject: "无抵押秒批贷款，额度高达50万",
    action: "block",
    reason: "内容规则命中：违规金融推广",
    mailType: "spam",
    deliveryStatus: "rejected",
    sourceIp: "112.84.22.9",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 55,
    basis: ["CR", "敏感词过滤", "CR-012"],
  },
  {
    tid: "MIC020",
    time: "2026-06-09 13:40:00",
    direction: "incoming",
    sender: "news@gambling-site.net",
    recipients: "user3@company.com",
    subject: "在线娱乐城注册即送888",
    action: "block",
    reason: "内容规则命中：违禁内容",
    mailType: "spam",
    deliveryStatus: "rejected",
    sourceIp: "23.225.11.4",
    ipLocation: "美国",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: false,
    score: 58,
    basis: ["CR", "敏感词过滤", "CR-012"],
  },
  {
    tid: "MIC021",
    time: "2026-06-09 15:02:00",
    direction: "incoming",
    sender: "offer@fake-invoice.biz",
    recipients: "finance@company.com",
    subject: "代开各类正规发票，点数优惠",
    action: "block",
    reason: "内容规则命中：违规发票广告",
    mailType: "spam",
    deliveryStatus: "rejected",
    sourceIp: "119.28.55.30",
    ipLocation: "中国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 52,
    basis: ["CR", "敏感词过滤", "CR-012"],
  },
  {
    tid: "MIC022",
    time: "2026-06-09 16:18:00",
    direction: "outgoing",
    sender: "pm@company.com",
    recipients: "blogger@tech-media.com",
    subject: "内部产品路线图（含未发布代号）",
    action: "block",
    reason: "内容规则命中：竞品/机密关键词",
    mailType: "sensitive",
    deliveryStatus: "audit_pending",
    sourceIp: "10.0.11.20",
    ipLocation: "中国",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 66,
    basis: ["CR", "竞品关键词监控", "CR-078"],
  },
  {
    tid: "MIC023",
    time: "2026-06-10 09:30:00",
    direction: "incoming",
    sender: "billing@paypa1-secure.com",
    recipients: "user4@company.com",
    subject: "您的账单已逾期，请点击处理",
    action: "quarantine",
    reason: "高级内容过滤命中：外部+仿冒品牌+紧急话术",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "185.220.101.44",
    ipLocation: "德国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 84,
    basis: ["ACF", "多条件组合策略", "ACF-001"],
  },
  {
    tid: "MIC024",
    time: "2026-06-10 10:48:00",
    direction: "incoming",
    sender: "hr-notice@company-hr.info",
    recipients: "user5@company.com",
    subject: "员工福利更新，请登录确认",
    action: "quarantine",
    reason: "高级内容过滤命中：外部+仿冒内部+登录诱导",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "45.83.122.9",
    ipLocation: "荷兰",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: true,
    score: 81,
    basis: ["ACF", "多条件组合策略", "ACF-001"],
  },
  {
    tid: "MIC025",
    time: "2026-06-10 14:15:00",
    direction: "incoming",
    sender: "campaign@bulk-mailer.io",
    recipients: "user6@company.com",
    subject: "限时优惠，点击短链领取",
    action: "block",
    reason: "高级内容过滤命中：批量群发+短链",
    mailType: "advertising",
    deliveryStatus: "rejected",
    sourceIp: "103.44.90.12",
    ipLocation: "新加坡",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: false,
    score: 49,
    basis: ["ACF", "批量群发短链组合", "ACF-014"],
  },
  // ── 阶段1（连接层/平台级）示例：租户管理员视角下处置依据应显示为「平台管控策略」──
  {
    tid: "MIC026",
    time: "2026-06-11 08:22:10",
    direction: "incoming",
    sender: "spam@known-bad-ip.ru",
    recipients: "user1@company.com, user2@company.com",
    subject: "您的账户存在异常，请立即验证",
    action: "block",
    reason: "发信 IP 命中 IP 黑名单",
    mailType: "spam",
    deliveryStatus: "rejected",
    sourceIp: "185.220.101.45",
    ipLocation: "俄罗斯",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 72,
    basis: ["IPBL", "IP黑名单命中", "IPBL-007"],
  },
  {
    tid: "MIC027",
    time: "2026-06-11 09:05:33",
    direction: "incoming",
    sender: "bulk@rbl-listed.net",
    recipients: "admin@company.com",
    subject: "专属折扣，仅限今日",
    action: "block",
    reason: "发信 IP 被 RBL 服务标记为垃圾邮件来源",
    mailType: "spam",
    deliveryStatus: "rejected",
    sourceIp: "91.108.56.200",
    ipLocation: "德国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 65,
    basis: ["RBL", "RBL黑名单命中", "RBL-023"],
  },
  // ── 扩充数据（MIC028-MIC052，原 demo 编号 MIC026-050 顺延 +2 避开上方 GT-12649 平台策略示例行）用于验证跨页选中与全量筛选导出功能 ──
  {
    tid: "MIC028",
    time: "2026-06-11 08:10:00",
    direction: "incoming",
    sender: "invoice@vendor-portal.ru",
    recipients: "finance@company.com",
    subject: "发票付款提醒 - 请尽快处理",
    action: "quarantine",
    reason: "RBL 命中：已知恶意发信域",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "91.108.4.200",
    ipLocation: "俄罗斯",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 88,
    basis: ["RBL", "恶意域名黑名单", "RBL-022"],
  },
  {
    tid: "MIC029",
    time: "2026-06-11 09:22:00",
    direction: "outgoing",
    sender: "sales@company.com",
    recipients: "partner@acme.com",
    subject: "合同草稿 v3 - 请审阅",
    action: "deliver",
    reason: "正常出站邮件",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.1.5",
    ipLocation: "内网",
    cluster: "Node 2",
    attachmentCount: 1,
    hasQrCode: false,
    score: 12,
  },
  {
    tid: "MIC030",
    time: "2026-06-11 10:05:00",
    direction: "incoming",
    sender: "no-reply@linkedin.com.phish.net",
    recipients: "hr@company.com",
    subject: "您有 5 条未读 LinkedIn 消息",
    action: "block",
    reason: "域名仿冒 LinkedIn 官方域名",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "185.107.57.90",
    ipLocation: "乌克兰",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: false,
    score: 91,
    basis: ["AI-PHISH", "仿冒社交平台域名", "AI-009"],
    senderIsNewOnThisMail: true,
  },
  {
    tid: "MIC031",
    time: "2026-06-11 11:30:00",
    direction: "incoming",
    sender: "newsletter@techcrunch.com",
    recipients: "cto@company.com",
    subject: "TechCrunch Daily: AI in 2026",
    action: "deliver",
    reason: "订阅类邮件，正常投递",
    mailType: "subscription",
    deliveryStatus: "delivered",
    sourceIp: "199.16.156.6",
    ipLocation: "美国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 8,
  },
  {
    tid: "MIC032",
    time: "2026-06-11 13:45:00",
    direction: "incoming",
    sender: "malware@evil-host.xyz",
    recipients: "it@company.com",
    subject: "系统安全更新包 - 请立即安装",
    action: "block",
    reason: "附件包含恶意宏代码",
    mailType: "virus",
    deliveryStatus: "rejected",
    sourceIp: "45.142.212.100",
    ipLocation: "荷兰",
    cluster: "Node 2",
    attachmentCount: 1,
    hasQrCode: false,
    score: 97,
    basis: ["AI-PHISH", "病毒附件检测", "AI-012"],
  },
  {
    tid: "MIC033",
    time: "2026-06-11 14:20:00",
    direction: "outgoing",
    sender: "cfo@company.com",
    recipients: "audit@external-firm.com",
    subject: "Q2 财务审计材料",
    action: "deliver",
    reason: "正常出站邮件",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.1.8",
    ipLocation: "内网",
    cluster: "Node 1",
    attachmentCount: 2,
    hasQrCode: false,
    score: 5,
    storageSizeBytes: 4_200_000,
  },
  {
    tid: "MIC034",
    time: "2026-06-11 15:00:00",
    direction: "incoming",
    sender: "promo@shop-discount.co",
    recipients: "user7@company.com",
    subject: "618 大促！最高优惠 90%",
    action: "discard",
    reason: "广告类邮件已超出每日限额",
    mailType: "advertising",
    deliveryStatus: "discarded",
    sourceIp: "103.55.88.5",
    ipLocation: "中国香港",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: false,
    score: 35,
    basis: ["ACF", "广告频率限制策略", "ACF-007"],
  },
  {
    tid: "MIC035",
    time: "2026-06-11 16:10:00",
    direction: "incoming",
    sender: "support@bank-secure-verify.com",
    recipients: "user8@company.com",
    subject: "您的银行账户需要立即验证",
    action: "quarantine",
    reason: "钓鱼网站链接检测",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "212.102.46.180",
    ipLocation: "英国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: true,
    score: 93,
    basis: ["AI-PHISH", "钓鱼 URL 检测", "AI-003"],
    senderIsNewOnThisMail: true,
  },
  {
    tid: "MIC036",
    time: "2026-06-12 08:30:00",
    direction: "incoming",
    sender: "it-helpdesk@company-internal.net",
    recipients: "user9@company.com, user10@company.com",
    subject: "内部IT系统维护通知",
    action: "quarantine",
    reason: "仿冒内部域名发信",
    mailType: "spoofing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "104.28.14.55",
    ipLocation: "美国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 78,
    basis: ["AI-SPOOF", "仿冒内部发信人", "AI-008"],
  },
  {
    tid: "MIC037",
    time: "2026-06-12 09:15:00",
    direction: "outgoing",
    sender: "marketing@company.com",
    recipients: "leads@prospect-list.com",
    subject: "产品发布邀请函",
    action: "deliver",
    reason: "正常出站营销邮件",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.2.3",
    ipLocation: "内网",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 15,
  },
  {
    tid: "MIC038",
    time: "2026-06-12 10:45:00",
    direction: "incoming",
    sender: "ceo@companY.com",
    recipients: "finance@company.com",
    subject: "紧���转账 - 请今日完成",
    action: "quarantine",
    reason: "CEO 欺诈：Unicode 域名仿冒",
    mailType: "spoofing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "149.154.160.10",
    ipLocation: "德国",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: false,
    score: 95,
    basis: ["AI-SPOOF", "Unicode 域名欺诈", "AI-011"],
    domainAgeDays: 2,
    senderIsNewOnThisMail: true,
  },
  {
    tid: "MIC039",
    time: "2026-06-12 11:30:00",
    direction: "incoming",
    sender: "updates@github-noreply.email",
    recipients: "dev@company.com",
    subject: "Your GitHub repository has a new issue",
    action: "block",
    reason: "仿冒 GitHub 官方通知域名",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "185.220.101.50",
    ipLocation: "荷兰",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 82,
    basis: ["AI-PHISH", "仿冒代码托管平台", "AI-015"],
  },
  {
    tid: "MIC040",
    time: "2026-06-12 13:00:00",
    direction: "incoming",
    sender: "report@experian-monitor.info",
    recipients: "user11@company.com",
    subject: "Your credit score has changed",
    action: "quarantine",
    reason: "仿冒信用机构域名",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "91.195.240.11",
    ipLocation: "英国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 87,
    basis: ["ACF", "仿冒金融机构策略", "ACF-019"],
  },
  {
    tid: "MIC041",
    time: "2026-06-12 14:20:00",
    direction: "outgoing",
    sender: "legal@company.com",
    recipients: "court@justice.gov.cn",
    subject: "法律文件提交 - 案号 2026-BJ-0412",
    action: "deliver",
    reason: "正常出站邮件",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.1.12",
    ipLocation: "内网",
    cluster: "Node 1",
    attachmentCount: 2,
    hasQrCode: false,
    score: 3,
    storageSizeBytes: 2_800_000,
  },
  {
    tid: "MIC042",
    time: "2026-06-12 15:45:00",
    direction: "incoming",
    sender: "crypto-alert@binance-security.net",
    recipients: "user12@company.com",
    subject: "您的数字钱包存在异常登录",
    action: "block",
    reason: "加密货币��鱼攻击",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "139.99.237.15",
    ipLocation: "新加坡",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: true,
    score: 92,
    basis: ["AI-PHISH", "加密货币钓���模式", "AI-018"],
    senderIsNewOnThisMail: true,
  },
  {
    tid: "MIC043",
    time: "2026-06-13 08:05:00",
    direction: "incoming",
    sender: "hr@company-benefits.org",
    recipients: "user13@company.com, user14@company.com, user15@company.com",
    subject: "年度体检预约确认",
    action: "quarantine",
    reason: "仿冒HR域名，批量群发",
    mailType: "spoofing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "104.21.32.88",
    ipLocation: "美国",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 74,
    basis: ["AI-SPOOF", "仿冒HR部门策略", "AI-020"],
  },
  {
    tid: "MIC044",
    time: "2026-06-13 09:40:00",
    direction: "incoming",
    sender: "service@amazon-order-confirm.co",
    recipients: "user16@company.com",
    subject: "Your Amazon order has been placed",
    action: "block",
    reason: "仿冒电商平台订单通知",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "23.106.248.100",
    ipLocation: "美国",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 89,
    basis: ["AI-PHISH", "仿冒电商平台", "AI-021"],
  },
  {
    tid: "MIC045",
    time: "2026-06-13 10:55:00",
    direction: "outgoing",
    sender: "ops@company.com",
    recipients: "vendor@supplier.com",
    subject: "采购订单 PO-2026-0613",
    action: "deliver",
    reason: "正常出站采购邮件",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.2.7",
    ipLocation: "内网",
    cluster: "Node 3",
    attachmentCount: 1,
    hasQrCode: false,
    score: 7,
  },
  {
    tid: "MIC046",
    time: "2026-06-13 11:30:00",
    direction: "incoming",
    sender: "password-reset@microsof1.com",
    recipients: "user17@company.com",
    subject: "Reset your Microsoft account password",
    action: "block",
    reason: "仿冒微软账号重置页面",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "5.188.206.25",
    ipLocation: "俄罗斯",
    cluster: "Node 2",
    attachmentCount: 0,
    hasQrCode: false,
    score: 96,
    basis: ["AI-PHISH", "仿冒微软品牌", "AI-005"],
    senderIsNewOnThisMail: true,
    domainAgeDays: 1,
  },
  {
    tid: "MIC047",
    time: "2026-06-13 13:10:00",
    direction: "incoming",
    sender: "bulk@promo-center.biz",
    recipients: "user18@company.com",
    subject: "恭喜您获得抽奖资格！",
    action: "discard",
    reason: "广告垃圾邮件策略命中",
    mailType: "spam",
    deliveryStatus: "discarded",
    sourceIp: "103.80.196.60",
    ipLocation: "中国香港",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 42,
    basis: ["ACF", "奖品诱导话术检测", "ACF-031"],
  },
  {
    tid: "MIC048",
    time: "2026-06-13 14:00:00",
    direction: "incoming",
    sender: "security@paypal-verify.net",
    recipients: "user19@company.com",
    subject: "PayPal: Action Required - Verify your account",
    action: "quarantine",
    reason: "钓鱼链接指向已知恶意域",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "78.141.203.22",
    ipLocation: "英国",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: true,
    score: 90,
    basis: ["AI-PHISH", "支付平台钓鱼检测", "AI-023"],
  },
  {
    tid: "MIC049",
    time: "2026-06-13 15:25:00",
    direction: "outgoing",
    sender: "it@company.com",
    recipients: "outsource@techpartner.com",
    subject: "系统运维报告 2026-06",
    action: "deliver",
    reason: "正常出站运维报告",
    mailType: "normal",
    deliveryStatus: "delivered",
    sourceIp: "10.0.1.20",
    ipLocation: "��网",
    cluster: "Node 2",
    attachmentCount: 1,
    hasQrCode: false,
    score: 6,
  },
  {
    tid: "MIC050",
    time: "2026-06-14 08:30:00",
    direction: "incoming",
    sender: "tax-alert@irs-gov.info",
    recipients: "user20@company.com",
    subject: "IRS: Immediate tax refund available",
    action: "block",
    reason: "仿冒政府税务机构",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "192.42.116.40",
    ipLocation: "荷兰",
    cluster: "Node 1",
    attachmentCount: 0,
    hasQrCode: false,
    score: 94,
    basis: ["AI-PHISH", "仿冒政府机构策略", "AI-026"],
    senderIsNewOnThisMail: true,
  },
  {
    tid: "MIC051",
    time: "2026-06-14 09:50:00",
    direction: "incoming",
    sender: "admin@company-helpdesk.support",
    recipients: "user21@company.com, user22@company.com",
    subject: "您的VPN访问权限即将到期",
    action: "quarantine",
    reason: "仿冒IT支持部门，凭据收割",
    mailType: "phishing",
    deliveryStatus: "quarantine_pending",
    sourceIp: "45.95.169.30",
    ipLocation: "德国",
    cluster: "Node 3",
    attachmentCount: 0,
    hasQrCode: false,
    score: 86,
    basis: ["AI-PHISH", "IT钓鱼攻击模板", "AI-027"],
  },
  {
    tid: "MIC052",
    time: "2026-06-14 11:00:00",
    direction: "incoming",
    sender: "notify@docusign-esign.com.fakehost.ru",
    recipients: "legal@company.com",
    subject: "New DocuSign document ready for signature",
    action: "block",
    reason: "仿冒电子签名平台",
    mailType: "phishing",
    deliveryStatus: "rejected",
    sourceIp: "185.220.101.99",
    ipLocation: "俄罗斯",
    cluster: "Node 1",
    attachmentCount: 1,
    hasQrCode: false,
    score: 93,
    basis: ["AI-PHISH", "仿冒电子签名平台", "AI-029"],
    senderIsNewOnThisMail: true,
    domainAgeDays: 3,
  },
];

function disposalAction(seed: MockDisposalSeed): string {
  if (seed.deliveryStatus === "audit_pending") return "audit";
  if (
    seed.deliveryStatus === "delivery_failed" ||
    seed.deliveryStatus === "partial_delivered"
  )
    return "accept";
  return {
    block: "reject",
    deliver: "accept",
    discard: "discard",
    quarantine: "quarantine",
    // Aggregate mixed rows still need a scalar fallback in detail-only mock
    // fields; the per-recipient actions are emitted separately below.
    mixed: "accept",
  }[seed.action];
}

function disposalDelivery(seed: MockDisposalSeed): string | undefined {
  return (
    {
      delivered: "delivered",
      delivery_failed: "failed",
      partial_delivered: "partial_delivered",
    } as Record<string, string>
  )[seed.deliveryStatus];
}

function disposalWorkflow(seed: MockDisposalSeed): string | undefined {
  return seed.deliveryStatus === "discarded" ? "discarded" : undefined;
}

function recipientDisposalStatus(seed: MockDisposalSeed): string {
  return (
    (
      {
        audit_pending: "audited",
        delivery_failed: "rejected",
        partial_delivered: "delivered",
        quarantine_pending: "quarantined",
      } as Record<string, string>
    )[seed.deliveryStatus] ?? seed.deliveryStatus
  );
}

// 收件人处置状态里"可操作"的集合，与 recipientActionsForStatus 的分支保持一致
// （webapp/src/components/email-disposal/lib/detail-helpers.ts）——只有落在
// 这个集合里的状态才配得到 object_id；blocked/rejected/discarded 等落进该函数
// default 分支的状态刻意不给 object_id，对齐 demo canOperate=false 的语义
// （design/origin/demo/components/mail-investigation/overview-action-section.tsx
// 的 recipientStatusConfig.blocked/discarded.canOperate=false）。
const OPERABLE_RECIPIENT_STATUSES = new Set([
  "delivered",
  "marked_delivered",
  "quarantined",
  "pending_review",
  "sidelined",
  "audited",
]);

// demo getContextData().generateRecipientStatus 的多投场景状态分布（同上文件
// 207-210 行）：收件人数 > 1 时���下标对 5 态列表取模，逐一铺开
// delivered/quarantined/pending_review/blocked/discarded。单投信仍沿用
// recipientDisposalStatus（按整封邮件的 deliveryStatus 映射）。
const MULTI_RECIPIENT_STATUS_DISTRIBUTION = [
  "delivered",
  "quarantined",
  "pending_review",
  "blocked",
  "discarded",
];

function recipientStatusFor(
  seed: MockDisposalSeed,
  recipientCount: number,
  index: number,
): string {
  if (recipientCount > 1) {
    return MULTI_RECIPIENT_STATUS_DISTRIBUTION[
      index % MULTI_RECIPIENT_STATUS_DISTRIBUTION.length
    ];
  }
  return recipientDisposalStatus(seed);
}

// 附件 + 扫描结果 mock：数据照抄 demo mockEntities.attachments（同一份
// design/origin/demo/components/mail-investigation/overview-action-section.tsx
// 278-286 行）——report.pdf（安全）+ invoice.xlsx（可疑，附带命中的
// virus_name），带附件的行统一给这 2 个，撑起「附件 (2)」tab 计数与威胁徽章。
function mockAttachmentsFor(seed: MockDisposalSeed) {
  if (seed.attachmentCount <= 0) return { attachments: [], scanResults: [] };
  const attachments = [
    {
      filename: "report.pdf",
      size: 1_258_291, // ~1.2MB，照抄 demo
      md5sum: "abc123mockmd5",
      content_type: "application/pdf",
      inline: false,
      content_length: 1_258_291,
    },
    {
      filename: "invoice.xlsx",
      size: 876_544, // ~856KB，照抄 demo
      md5sum: "def456mockmd5",
      content_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      inline: false,
      content_length: 876_544,
    },
  ];
  const scanResults = [
    {
      scan_id: `scan-${seed.tid}-1`,
      message_id: seed.tid,
      direction: seed.direction,
      antivirus_result: "clean",
      final_disposition: disposalAction(seed),
      is_encrypted: false,
      attachment_md5: "abc123mockmd5",
      qr_code_count: 0,
      qr_code_text: null,
      is_zip_bomb: false,
      virus_name: null,
      duration_ms: 24,
    },
    {
      scan_id: `scan-${seed.tid}-2`,
      message_id: seed.tid,
      direction: seed.direction,
      antivirus_result: seed.mailType === "virus" ? "virus" : "suspicious",
      final_disposition: disposalAction(seed),
      is_encrypted: false,
      attachment_md5: "def456mockmd5",
      qr_code_count: seed.hasQrCode ? 1 : 0,
      qr_code_text: seed.hasQrCode
        ? "https://suspicious.example/mock-login"
        : null,
      is_zip_bomb: false,
      virus_name:
        seed.mailType === "virus"
          ? "Mock.Trojan.Generic"
          : "Mock.Trojan.GenericKD",
      duration_ms: 24,
    },
  ];
  return { attachments, scanResults };
}

function disposalBasis(seed: MockDisposalSeed) {
  if (!seed.basis) return undefined;
  return {
    policy_key: seed.basis[0],
    rule_name: seed.basis[1],
    rule_id: seed.basis[2],
    // disposalBasisActionOverride 只影响这个展示字段（威胁摘要卡「处置依据」
    // 行的动作徽标），不影响下面 mockMailLog 里真正驱动收件人按钮/派发状态的
    // action/deliveryStatus 字段。
    action: seed.disposalBasisActionOverride ?? disposalAction(seed),
    // confidence 供 disposal-basis-config.ts 里 AI-* 策略的 hitDetail() 模板
    // 使用（如 AI-PHISH 的「置信度：{cf}%」），让 ThreatSummaryCard 的
    // 「AI判定依据」行渲染出有意义的文案，而不是模板兜底的 "-"。
    hit_values: { reason: seed.reason, score: String(seed.score), confidence: String(seed.score) },
    detection_tags: [`source:${seed.basis[0].toLowerCase()}`],
  };
}

function mockMailLog(seed: MockDisposalSeed, index: number) {
  const recipients = seed.recipients.split(",").map((item) => item.trim());
  const { attachments: mockAttachments, scanResults: mockScanResults } =
    mockAttachmentsFor(seed);
  return {
    id: index + 1,
    message_id: `<mock-${seed.tid.toLowerCase()}@osgateway.local>`,
    message_uuid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    tid: seed.tid,
    sender: seed.sender,
    sender_name: seed.sender.split("@")[0],
    sender_domain: seed.sender.split("@")[1],
    recipients,
    subject: seed.subject,
    action: seed.isMixed ? "mixed" : disposalAction(seed),
    status: seed.isMixed ? "mixed" : seed.deliveryStatus,
    disposition_actions: seed.isMixed ? ["accept", "quarantine", "sideline"] : undefined,
    reason: seed.reason,
    authenticated: seed.direction === "outgoing",
    smtp_user: seed.direction === "outgoing" ? seed.sender : undefined,
    client_ip: seed.sourceIp,
    queue_id: `MOCK${String(index + 1).padStart(5, "0")}`,
    storage_node: seed.cluster,
    storage_size: seed.storageSizeBytes ?? 18_000 + index * 1371,
    delivery_status_summary: seed.isMixed ? "partial_delivered" : disposalDelivery(seed),
    workflow_outcome_summary: seed.isMixed ? "released" : disposalWorkflow(seed),
    recall_status_summary: "none",
    received_at: seed.time.replace(" ", "T") + "+08:00",
    processed_at: seed.time.replace(" ", "T") + "+08:00",
    email_type: seed.finalType ?? seed.mailType,
    email_type_overridden: Boolean(seed.finalType),
    email_type_original: seed.finalType ? seed.mailType : undefined,
    correction_source:
      seed.correctionSource === "user_recall"
        ? "user_retrieval"
        : seed.correctionSource,
    disposal_basis: disposalBasis(seed),
    disposal_policy_keys: seed.basis?.[0],
    similarity_pct: Math.max(62, seed.score),
    geo_region: seed.ipLocation,
    geo_region_name: seed.ipLocation,
    geo_city: seed.ipLocation,
    geo_isp: "MockNet",
    geo_asn: 12345 + index,
    // 钓鱼行照抄 demo getContextData() 的 auth 块（SPF✓ DKIM✗ DMARC⚠，design/
    // origin/demo/components/mail-investigation/overview-action-section.tsx
    // 239 行）；其余行沿用既有按 score 的粗粒度映射。
    spf_valid:
      seed.mailType === "phishing" ? "pass" : seed.score >= 80 ? "fail" : "pass",
    dkim_valid:
      seed.mailType === "phishing" ? "fail" : seed.score >= 80 ? "fail" : "pass",
    dmarc_valid:
      seed.mailType === "phishing"
        ? "softfail"
        : seed.score >= 80
          ? "fail"
          : "pass",
    ptr_valid: seed.score < 80,
    ptr_domain: `mail.${seed.sender.split("@")[1]}`,
    return_path: `bounce@${seed.sender.split("@")[1]}`,
    reply_to: seed.sender,
    x_mailer: "Microsoft Outlook 16.0",
    // A10 紧急/敏感词徽章（isSensitiveUrgent）——钓鱼/敏感数据外发行命中。
    sensitive_keyword_hit:
      seed.mailType === "phishing" || seed.mailType === "sensitive",
    // 内容实体链接 tab：照抄 demo mockEntities.links（同上文件 279-282 行），
    // vt_score 照抄 demo html_spec §④「VirusTotal��测: 47/90」/「0/90」。
    entity_urls:
      seed.mailType === "phishing"
        ? [
            {
              url: "https://evil.com/login",
              domain: "evil.com",
              check_result: "THREAT",
              threat_type: "MALWARE",
              verdict: "malicious",
              vt_score: "47/90",
            },
            {
              url: "https://safe.company.com/x",
              domain: "safe.company.com",
              vt_score: "0/90",
            },
          ]
        : undefined,
    // 域名年龄（命中特征「域名年龄」badge）：���在 seed 显式提��时出现，其余行
    // 保持缺省（deriveDomainAge() 优雅降级为不渲染）。
    domain_age_days: seed.domainAgeDays,
    cac_tid: seed.tid,
    cac_result: {
      result_code: seed.score >= 80 ? "threat" : "pass",
      tid: seed.tid,
      description: seed.reason,
    },
    content: `这是 ${seed.tid} 的 mock 邮件正文。\n主题：${seed.subject}\n处置原因：${seed.reason}`,
    html_content: `<p>这是 <strong>${seed.tid}</strong> 的 mock 邮件正文。</p><p>${seed.reason}</p>`,
    attachments: mockAttachments,
    urls: seed.hasQrCode ? ["https://suspicious.example/mock-login"] : [],
    processing_time_ms: 86 + index * 7,
    stage_timings: {
      connection: 8,
      authentication: 12,
      content: 34,
      attachment: 20,
      decision: 12,
    },
    matched_action_rules: seed.basis
      ? {
          data: {
            [seed.basis[0]]: [
              Number(seed.basis[2].match(/\d+/)?.[0] ?? index + 1),
            ],
          },
        }
      : {},
    final_action_rule: seed.basis
      ? {
          [recipients[0]]: {
            rule_id: Number(seed.basis[2].match(/\d+/)?.[0] ?? index + 1),
            action: disposalAction(seed),
            metadata: seed.reason,
          },
        }
      : {},
    similar_detection: {
      matched: seed.score >= 60,
      skipped: seed.score < 60,
      cluster_id: seed.cluster,
      similarity_pct: Math.max(62, seed.score),
      action: disposalAction(seed),
      skip_reason: seed.score < 60 ? "低于相似度阈值" : undefined,
    },
    recipient_dispositions: recipients.map((recipient, i) => {
      const status = recipientStatusFor(seed, recipients.length, i);
      // mixed seed: 前半投递、后半隔离/��路，模拟真实 mixed 场景
      const mixedActions = ["accept", "accept", "accept", "quarantine", "sideline"];
      const mixedStatuses = ["delivered", "delivered", "delivered", "quarantined", "delivered"];
      const mixedReasons = [
        "rule 投递白名单 matched at data stage",
        "rule 投递白名单 matched at data stage",
        "rule 投递白名单 matched at data stage",
        "rule 隔离扣留 matched at data stage",
        "default_sideline",
      ];
      const isMixedRcpt = seed.isMixed && i < mixedActions.length;
      return {
        recipient,
        final_action: isMixedRcpt ? mixedActions[i] : disposalAction(seed),
        status: isMixedRcpt ? mixedStatuses[i] : status,
        reason: isMixedRcpt ? mixedReasons[i] : seed.reason,
        object_id: OPERABLE_RECIPIENT_STATUSES.has(status)
          ? `obj-${index + 1}-${i}`
          : undefined,
      };
    }),
    scan_results: mockScanResults,
    phish_agent_check:
      seed.score >= 80
        ? {
            status: "completed",
            checked: true,
            verdict: "malicious",
            risk_level: "high",
            summary: seed.reason,
            confidence: seed.score / 100,
            details: { tid: seed.tid, source: "mock-fixture" },
            steps: [
              {
                name: "邮件上下文分析",
                status: "completed",
                message: seed.reason,
                started_at: seed.time.replace(" ", "T") + "+08:00",
                finished_at: seed.time.replace(" ", "T") + "+08:00",
              },
            ],
            recommended_actions: [
              {
                type: disposalAction(seed),
                scope: "message",
                target_count: 1,
                reason: seed.reason,
              },
            ],
          }
        : undefined,
    // 首次出现新发信人（命中特征「首次出现」badge，isNewSender() 语义）：
    // senderIsNewOnThisMail 的行等于自己的 received_at；其余行沿用既有的固定
    // 历史值（已知发信人场景）。
    sender_first_seen_at: seed.senderIsNewOnThisMail
      ? seed.time.replace(" ", "T") + "+08:00"
      : "2026-05-01T08:00:00+08:00",
  };
}

let mockDisposalMailLogs = MOCK_DISPOSAL_SEEDS.map(mockMailLog);

function displayStatusOf(item: (typeof mockDisposalMailLogs)[number]): string {
  if (item.recall_status_summary && item.recall_status_summary !== "none")
    return item.recall_status_summary;
  if (item.workflow_outcome_summary === "discarded") return "discarded";
  if (item.action === "quarantine") return "quarantine_pending";
  if (item.action === "audit") return "audit_pending";
  if (item.action === "reject") return "rejected";
  if (item.action === "discard") return "discarded";
  if (item.action === "mixed") return "partial_delivered";
  return (
    (
      {
        delivered: "delivered",
        partial_delivered: "partial_delivered",
        failed: "delivery_failed",
      } as Record<string, string>
    )[item.delivery_status_summary ?? ""] ?? "delivering"
  );
}

function mockAdvancedValue(
  item: (typeof mockDisposalMailLogs)[number],
  field: string,
): unknown {
  const attachments = item.attachments ?? [];
  const values: Record<string, unknown> = {
    header_sender: item.sender,
    sender: item.sender,
    header_recipient: item.recipients,
    envelope_recipient: item.recipients,
    sender_name: item.sender_name,
    send_hour: Number(item.received_at.slice(11, 13)),
    storage_size: item.storage_size,
    client_ip: item.client_ip,
    recipient_domain: item.recipients.map(
      (recipient) => recipient.split("@")[1] ?? "",
    ),
    tid: item.tid,
    similar_cluster: item.similar_detection?.cluster_id,
    attachment_count: attachments.length,
    attachment_total_size: attachments.reduce(
      (sum, attachment) => sum + attachment.size,
      0,
    ),
    attachment_type: attachments.map((attachment) => attachment.content_type),
    attachment_name: attachments.map((attachment) => attachment.filename),
    attachment_md5: attachments.map((attachment) => attachment.md5sum),
    spf_valid: item.spf_valid,
    dkim_valid: item.dkim_valid,
    dmarc_valid: item.dmarc_valid,
    ptr_valid: item.ptr_valid,
    similar_domain:
      item.disposal_policy_keys === "AUTH" ? "triggered" : "notTriggered",
    display_name_detect:
      item.disposal_policy_keys === "AI-SPOOF" ? "abnormal" : "normal",
    mail_from_empty: item.sender === "",
    virus_scan_result: item.email_type === "virus" ? "detected" : "clean",
    intent_label: item.email_type,
    qr_code_result: item.urls.length > 0 ? "maliciousUrl" : "normal",
    url_result: item.disposal_policy_keys === "URL" ? "maliciousUrl" : "normal",
    keyword_hit: item.reason,
    rbl_result:
      item.disposal_policy_keys === "RBL" ? "triggered" : "notTriggered",
    threat_level:
      (item.phish_agent_check?.confidence ?? 0) >= 0.8 ? "critical" : "none",
    disposal_rule_id: item.disposal_basis?.rule_id,
  };
  return values[field] ?? (item as unknown as Record<string, unknown>)[field];
}

function mockConditionMatches(
  item: (typeof mockDisposalMailLogs)[number],
  condition: { field?: string; op?: string; value?: unknown },
): boolean {
  const current = mockAdvancedValue(item, condition.field ?? "");
  const candidates = Array.isArray(current) ? current : [current];
  const expected = condition.value;
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const compare = (candidate: unknown, value: unknown) =>
    String(candidate ?? "").toLowerCase() === String(value ?? "").toLowerCase();
  const contains = (candidate: unknown, value: unknown) =>
    String(candidate ?? "")
      .toLowerCase()
      .includes(String(value ?? "").toLowerCase());
  switch (condition.op) {
    case "is_null":
      return current == null || candidates.every((value) => value === "");
    case "is_not_null":
      return current != null && candidates.some((value) => value !== "");
    case "eq":
      return candidates.some((candidate) => compare(candidate, expected));
    case "neq":
      return candidates.every((candidate) => !compare(candidate, expected));
    case "contains":
      return candidates.some((candidate) => contains(candidate, expected));
    case "not_contains":
      return candidates.every((candidate) => !contains(candidate, expected));
    case "starts_with":
      return candidates.some((candidate) =>
        String(candidate ?? "")
          .toLowerCase()
          .startsWith(String(expected ?? "").toLowerCase()),
      );
    case "ends_with":
      return candidates.some((candidate) =>
        String(candidate ?? "")
          .toLowerCase()
          .endsWith(String(expected ?? "").toLowerCase()),
      );
    case "regex": {
      try {
        return candidates.some((candidate) =>
          new RegExp(String(expected ?? ""), "i").test(String(candidate ?? "")),
        );
      } catch {
        return false;
      }
    }
    case "gt":
      return Number(current) > Number(expected);
    case "lt":
      return Number(current) < Number(expected);
    case "gte":
      return Number(current) >= Number(expected);
    case "lte":
      return Number(current) <= Number(expected);
    case "between":
      return (
        expectedList.length === 2 &&
        Number(current) >= Number(expectedList[0]) &&
        Number(current) <= Number(expectedList[1])
      );
    case "in":
      return candidates.some((candidate) =>
        expectedList.some((value) => compare(candidate, value)),
      );
    case "not_in":
      return candidates.every((candidate) =>
        expectedList.every((value) => !compare(candidate, value)),
      );
    default:
      return true;
  }
}

function mockAdvancedMatches(
  item: (typeof mockDisposalMailLogs)[number],
  raw: string,
): boolean {
  try {
    const filter = JSON.parse(raw) as {
      operator?: "AND" | "OR";
      groups?: {
        not?: boolean;
        operator?: "AND" | "OR";
        conditions?: { field?: string; op?: string; value?: unknown }[];
      }[];
    };
    const groupResults = (filter.groups ?? []).map((group) => {
      const results = (group.conditions ?? []).map((condition) =>
        mockConditionMatches(item, condition),
      );
      const matched =
        group.operator === "OR"
          ? results.some(Boolean)
          : results.every(Boolean);
      return group.not ? !matched : matched;
    });
    return filter.operator === "OR"
      ? groupResults.some(Boolean)
      : groupResults.every(Boolean);
  } catch {
    return true;
  }
}

export function mockEmailDisposalList(path: string) {
  const query = new URLSearchParams(path.split("?")[1] ?? "");
  let items = [...mockDisposalMailLogs];
  const contains = (value: unknown, needle: string) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle.toLowerCase());
  for (const key of ["sender", "recipient", "subject"] as const) {
    const value = query.get(key);
    if (!value) continue;
    items = items.filter((item) =>
      key === "recipient"
        ? item.recipients.some((entry) => contains(entry, value))
        : contains(item[key], value),
    );
  }
  const direction = query.get("direction");
  if (direction)
    items = items.filter((item) =>
      direction === "send" ? item.authenticated : !item.authenticated,
    );
  const statuses = query.get("display_status")?.split(",").filter(Boolean);
  if (statuses?.length)
    items = items.filter((item) => statuses.includes(displayStatusOf(item)));
  const emailTypes = query.get("email_type")?.split(",").filter(Boolean);
  if (emailTypes?.length)
    items = items.filter((item) => emailTypes.includes(item.email_type));
  const policyKeys = query
    .get("disposal_policy_keys")
    ?.split(",")
    .filter(Boolean);
  if (policyKeys?.length)
    items = items.filter((item) =>
      policyKeys.includes(item.disposal_policy_keys ?? ""),
    );
  const advanced = query.get("advanced_filters");
  if (advanced)
    items = items.filter((item) => mockAdvancedMatches(item, advanced));
  const sortOrder = query.get("sort_order");
  if (sortOrder === "asc" || sortOrder === "desc") {
    items.sort((left, right) => {
      const comparison = left.received_at.localeCompare(right.received_at);
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }
  const page = Math.max(1, Number(query.get("page") ?? 1));
  const pageSize = Math.max(1, Number(query.get("page_size") ?? 20));
  return {
    items: structuredClone(items.slice((page - 1) * pageSize, page * pageSize)),
    total: items.length,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

export function mockEmailDisposalDetail(id: number) {
  const item = mockDisposalMailLogs.find((entry) => entry.id === id);
  return item ? structuredClone(item) : null;
}

export function mockEmailDisposalPreview(id: number) {
  const item = mockDisposalMailLogs.find((entry) => entry.id === id);
  if (!item) return null;
  return {
    message_id: item.message_id,
    subject: item.subject,
    from: item.sender,
    from_name: item.sender_name,
    to: item.recipients.map((addr) => ({
      addr,
      name: addr.split("@")[0],
      dn: "",
      isto: true,
    })),
    cc: [],
    text_body: item.content,
    html_body: item.html_content,
    attachments: item.attachments,
    urls: item.urls,
    headers: {
      From: item.sender,
      To: item.recipients.join(", "),
      Subject: item.subject,
      "Message-ID": item.message_id,
      "X-Mock-TID": item.tid,
    },
  };
}

export function mockEmailDisposalEvents(id: number) {
  const item = mockDisposalMailLogs.find((entry) => entry.id === id);
  if (!item) return { items: [], total: 0, page: 1, page_size: 100 };
  const genericEvents = [
    "connected",
    "message_received",
    "policy_decided",
    displayStatusOf(item),
  ].map((eventType, index) => ({
    id: id * 100 + index,
    mail_log_id: id,
    event_source: index < 2 ? "postfix" : "antispam",
    event_type: eventType,
    event_result: index === 3 ? displayStatusOf(item) : "success",
    queue_id: item.queue_id,
    message_id: item.message_id,
    sender: item.sender,
    recipients: item.recipients.join(", "),
    event_time: item.received_at,
    raw_payload: JSON.stringify({
      event: eventType,
      tid: item.tid,
      action: item.action,
    }),
    raw_line: `${item.received_at} ${item.queue_id} ${eventType} ${item.action}`,
    correlation_status: "matched",
  }));
  // 每个收件人一条投递事件——补 `recipient`（单数）+ `dsn`，供 RecipientStatus
  // 的已投递分组按收件人匹配投递明细行（webapp/src/components/email-disposal/
  // components/recipient-status.tsx: events.find(e => e.recipient === d.recipient)）。
  const deliveredStatuses = new Set(["delivered", "marked_delivered"]);
  const perRecipientEvents = (item.recipient_dispositions ?? []).map(
    (d, index) => {
      const delivered = deliveredStatuses.has(d.status);
      return {
        id: id * 100 + 10 + index,
        mail_log_id: id,
        event_source: "postfix",
        event_type: "delivery",
        event_result: delivered ? "success" : "failed",
        queue_id: item.queue_id,
        message_id: item.message_id,
        sender: item.sender,
        recipient: d.recipient,
        recipients: d.recipient,
        dsn: delivered ? "2.0.0" : "5.1.1",
        event_time: item.received_at,
        raw_payload: JSON.stringify({
          event: "delivery",
          recipient: d.recipient,
          status: d.status,
        }),
        raw_line: `${item.received_at} ${item.queue_id} delivery ${d.recipient} ${d.status}`,
        correlation_status: "matched",
      };
    },
  );
  const events = [...genericEvents, ...perRecipientEvents];
  return { items: events, total: events.length, page: 1, page_size: 100 };
}

export function mockEmailDisposalSimilar(body: unknown) {
  const ids =
    ((body ?? {}) as { mail_log_ids?: number[]; limit?: number })
      .mail_log_ids ?? [];
  const limit = Math.min(10, ((body ?? {}) as { limit?: number }).limit ?? 10);
  const items = mockDisposalMailLogs
    .filter((item) => !ids.includes(item.id))
    .slice(0, limit);
  return {
    items: structuredClone(items),
    total: items.length,
    page: 1,
    page_size: limit,
  };
}

export function mockEmailDisposalMutate(
  body: unknown,
  action: "bulk" | "recall",
) {
  const raw = (body ?? {}) as {
    mail_log_ids?: number[];
    action?: string;
    final_type?: string;
    object_id?: string;
  };
  const ids = raw.mail_log_ids ?? [];

  // 对象级处置（DD-5）：disposeByObject 打的也是这个端点，但只带一个
  // mail_log_id + object_id，且读的是 `{results: ObjectDisposeResult[]}`，
  // 不是整封维度的 succeeded/failed 汇总——真实后端 dispatchDisposeObject 同样
  // 分流（internal/api/mail_log_disposal.go 的 BulkDisposeMailLogs），mock 需
  // 要镜像这个分支，否则 useRecipientDisposition 的单/多收件人处置按钮读不到
  // results[] 而永远显示失败。
  if (raw.object_id) {
    const mailLogId = ids[0];
    // RA-5: 隔离/阻断 are demo-parity, mock-only object-mode actions -- the
    // real backend only accepts release|delete here (see
    // disposal-detail-api.ts's disposeObjectAction doc comment), so this
    // mock is the ONLY place action can be "quarantine"/"block".
    const STATUS_BY_ACTION: Record<string, string> = {
      release: "delivered",
      delete: "discarded",
      quarantine: "quarantined",
      block: "blocked",
    };
    const FINAL_ACTION_BY_ACTION: Record<string, string> = {
      release: "accept",
      delete: "discard",
      quarantine: "quarantine",
      block: "reject",
    };
    const newStatus = STATUS_BY_ACTION[raw.action ?? ""] ?? "discarded";
    const newFinalAction = FINAL_ACTION_BY_ACTION[raw.action ?? ""] ?? "discard";
    mockDisposalMailLogs = mockDisposalMailLogs.map((item) => {
      if (item.id !== mailLogId) return item;
      return {
        ...item,
        recipient_dispositions: (item.recipient_dispositions ?? []).map((d) =>
          d.object_id === raw.object_id
            ? { ...d, status: newStatus, final_action: newFinalAction }
            : d,
        ),
      };
    });
    return {
      results: [
        { mail_log_id: mailLogId, object_id: raw.object_id, status: "succeeded" },
      ],
    };
  }

  mockDisposalMailLogs = mockDisposalMailLogs.map((item) => {
    if (!ids.includes(item.id)) return item;
    if (action === "recall" || raw.action === "recall")
      return {
        ...item,
        recall_status_summary: "recall_success",
        email_type: raw.final_type ?? item.email_type,
        email_type_overridden:
          Boolean(raw.final_type) || item.email_type_overridden,
      };
    if (raw.action === "release")
      return {
        ...item,
        action: "accept",
        workflow_outcome_summary: "released",
        delivery_status_summary: "delivered",
        email_type: raw.final_type ?? item.email_type,
        email_type_overridden:
          Boolean(raw.final_type) || item.email_type_overridden,
      };
    return { ...item, workflow_outcome_summary: "deleted" };
  });
  return {
    succeeded: ids,
    failed: [],
    not_applicable: [],
    reclassify_failed: [],
  };
}

export function mockEmailDisposalFields() {
  const defs = [
    ["header_sender", "text", "basic"],
    ["envelope_sender", "text", "basic"],
    ["header_recipient", "text", "basic"],
    ["envelope_recipient", "text", "basic"],
    ["display_name", "text", "basic"],
    ["send_hour", "number", "basic"],
    ["email_size", "number", "basic"],
    ["sender_ip", "text", "basic"],
    ["recipient_domain", "text", "basic"],
    ["tid", "text", "basic"],
    ["cluster", "text", "basic"],
    ["attachment_count", "number", "attachment"],
    ["attachment_total_size", "number", "attachment"],
    ["attachment_type", "text", "attachment"],
    ["attachment_name", "text", "attachment"],
    ["attachment_md5", "text", "attachment"],
    ["spf_result", "enum", "security"],
    ["dkim_result", "enum", "security"],
    ["dmarc_result", "enum", "security"],
    ["ptr_result", "enum", "security"],
    ["similar_domain", "boolean", "security"],
    ["display_name_detect", "boolean", "security"],
    ["mail_from_empty", "boolean", "security"],
    ["virus_scan_result", "enum", "security"],
    ["intent_engine_result", "enum", "security"],
    ["qr_code_result", "boolean", "security"],
    ["url_result", "enum", "security"],
    ["keyword_hit", "text", "security"],
    ["rbl_result", "enum", "security"],
    ["threat_level", "enum", "security"],
  ];
  return defs.map(([key, type, group]) => ({
    key,
    label: key,
    type,
    group,
    operators:
      type === "number"
        ? ["eq", "neq", "gt", "lt", "between", "in", "not_in", "is_null"]
        : [
            "eq",
            "neq",
            "contains",
            "not_contains",
            "starts_with",
            "ends_with",
            "regex",
            "in",
            "not_in",
            "is_null",
          ],
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 处置设置（email-disposal/disposal-settings，mock）
// ════════════════════════════════════════════════════════════════════════════════

// ---- 处置设置（demo disposal-settings-page.tsx 初始 state，数据照抄 demo）----
let disposalSettingsState: DisposalSettings | null = null;

export function mockDisposalSettingsGet(): DisposalSettings {
  if (!disposalSettingsState) disposalSettingsState = buildDefaultDisposalSettingsFixture();
  return disposalSettingsState;
}

export function mockDisposalSettingsPut(body: DisposalSettings): DisposalSettings {
  disposalSettingsState = { ...body, server_tz: "Asia/Shanghai" };
  return disposalSettingsState;
}

function buildDefaultDisposalSettingsFixture(): DisposalSettings {
  const mal = ["phishing", "virus", "account_compromised", "spoofing", "harmful"];
  const grey = ["spam", "advertising", "suspicious", "sensitive"];
  const category_notify: Record<string, CategoryNotifyEntry> = {};
  for (const k of mal) category_notify[k] = { enabled: true, min_score: 0.6, max_score: 1 };
  for (const k of grey) category_notify[k] = { enabled: k === "spam", min_score: 0.7, max_score: 1 };
  return {
    quarantine: {
      category_notify,
      notify_frequency: "daily",
      custom_weekdays: [],
      notify_times: ["09:00", "14:00"],
      recipient_group_ids: [9101],
      department_paths: ["研发部"],
      permissions: {
        recall: { enabled: true, valid_days: 30 },
        preview: { enabled: true, valid_days: 30 },
        whitelist: { enabled: false, valid_days: 2 },
        blacklist: { enabled: false, valid_days: 2 },
      },
      portal_base_url: "",
    },
    review: {
      duration_mode: "custom",
      custom_minutes: 15,
      max_recheck_minutes: 30,
      timeout_auto_deliver: true,
      sender_notify_on_queue: false,
      sender_notify_on_result: true,
      reviewer_emails: [],
      reviewer_notify_interval_minutes: 30,
      reviewer_active_start: "00:00:00",
      reviewer_active_end: "23:59:59",
      timeout_temp_disposal: "deliver",
      timeout_mark_positions: [],
      timeout_mark_text: "",
    },
    recall: {
      task_timeout_seconds: 30,
      threat_intel: { read_policy: "recall", unread_policy: "recall" },
      ai_detection: { read_policy: "notify", unread_policy: "recall" },
      notify_emails: ["admin@example.com"],
      notify_frequency: "realtime",
    },
    tz: "Asia/Shanghai",
    server_tz: "Asia/Shanghai",
  };
}

// ---- 收信人组（demo recipient-groups.ts，ruleId 用 9101-9105 稳定值；
// 刻意避开 9001-9099：群组策略的 mock 写路由按 /unified-rules/90\d\d 收窄，
// 且群组策略演示规则本身占用 9001-9005）----
// 复用既有的 sfGroupRule（见本文件 group-management 区）生成一个符合
// ruleToGroup（webapp/src/lib/api/groups.ts）判型条件的 Rule：
// stage='rcpt' → GroupType 'recipient'，且 tags 带 `grp:<name>` 前缀
// （否则 ruleToGroup 会因找不到 tag 直接判空丢弃这条数据）。member_count
// 用 demo 的聚合数字直接覆盖（不虚构不存在的真实成员邮箱列表）。
export function mockRecipientGroupRulesList(): { items: Rule[]; total: number } {
  const groups: Array<[number, string, number]> = [
    [9101, "高管邮箱", 15],
    [9102, "财务人员", 28],
    [9103, "IT 管理员", 9],
    [9104, "全体员工", 460],
    [9105, "客服团队", 42],
  ];
  return {
    items: groups.map(([id, name, memberCount]) => {
      const rule = sfGroupRule({
        id,
        name,
        type: "recipient",
        created_at: "2026-07-01T00:00:00Z",
        members: [`${id}@company.com`],
      });
      return {
        ...rule,
        page: "groups",
        member_count: memberCount,
        reference_count: 0,
      };
    }),
    total: groups.length,
  };
}

// ---- 部门聚合（demo MOCK_CONTACTS 8 人派生）----
export function mockContactDepartmentsList() {
  const rows: Array<[string, number, string[]]> = [
    ["研发部 / 后端组", 1, ["总部 AD"]],
    ["研发部 / 前端组", 1, ["总部 AD"]],
    ["财务部", 1, ["总部 AD"]],
    ["市场部", 1, ["邮件系统"]],
    ["总裁办", 1, ["网易企邮"]],
    ["人力资源部", 1, ["网易企邮"]],
    ["销售部 / 华东区", 1, ["邮件系统"]],
    ["法务部", 1, ["总部 AD"]],
  ];
  return {
    items: rows.map(([path, member_count, source_names]) => {
      const segs = path.split(" / ");
      return {
        path,
        name: segs[segs.length - 1],
        parent_path: segs.length > 1 ? segs.slice(0, -1).join(" / ") : null,
        member_count,
        source_names,
      };
    }),
  };
}

// ---- recall keys（webapp 扩展卡片，空列表起步）----
let recallKeysState: Array<Record<string, unknown>> = [];

export function mockRecallKeysList(): { items: Array<Record<string, unknown>> } {
  return { items: recallKeysState };
}

export function mockRecallKeyCreate(body: Record<string, unknown>): Record<string, unknown> {
  const item = {
    id: recallKeysState.length + 1,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...body,
  };
  recallKeysState = [...recallKeysState, item];
  return item;
}

export function mockRecallKeyDelete(id: number): void {
  recallKeysState = recallKeysState.filter((k) => k.id !== id);
}

// ─── 链接保护日志（logs-link-logs html_spec §2.2/§4.1）────────────────────────
// 数据照抄 demo components/link-logs/link-logs-page.tsx 的 MOCK_LOGS 6 行，
// 租户按 demo 同样的轮转规则分配（idx % 租户数 → mockTenants 1/2/3）。
// demo 行3 的 triggerStage 是 "sandbox"（URL沙箱）；本产品按 2026-07-09 v2 spec
// §3.1 只有 回扫黑名单→查询情报→深度复检 三段、无独立沙箱段，映射为 phishing_agent。
const mockLinkClickLogs: LinkClickLog[] = [
  {
    id: 1,
    log_id: "TID20251103001",
    message_id: "TID20251103001",
    occurred_at: "2025-11-03T10:31:12+08:00",
    clicker: "alice@company.com",
    sender: "attacker@phishing.com",
    subject: "重要 - 请立即验证您的账户",
    original_url: "https://fake-bank-login.com/verify",
    rewritten_url: "https://safelink.gateway.com/r/9f2a1c",
    client_ip: "203.0.113.45",
    click_source: "body",
    trigger_stage: "cloud_intel",
    verdict: "phishing",
    detail: "云端情报命中：该域名被标记为钓鱼站点（情报源 PhishTank）",
    final_result: "alerted",
    user_action: "abandoned",
    tenant_id: 1,
    tenant_name: "示例租户 A",
  },
  {
    id: 2,
    log_id: "TID20251103002",
    message_id: "TID20251103002",
    occurred_at: "2025-11-03T09:48:55+08:00",
    clicker: "bob@company.com",
    sender: "promo@unknown-domain.xyz",
    subject: "您有一笔待领取的奖励",
    original_url: "https://unknown-domain.xyz/claim?id=8821",
    rewritten_url: "https://safelink.gateway.com/r/3b7e0d",
    client_ip: "198.51.100.22",
    click_source: "body",
    trigger_stage: "local_blacklist",
    verdict: "malicious",
    detail: "本地黑名单命中：匹配规则 *.unknown-domain.xyz",
    final_result: "alerted",
    user_action: "proceeded",
    tenant_id: 2,
    tenant_name: "示例租户 B",
  },
  {
    id: 3,
    log_id: "TID20251103003",
    message_id: "TID20251103003",
    occurred_at: "2025-11-03T09:20:31+08:00",
    clicker: "carol@company.com",
    sender: "newsletter@marketing.io",
    subject: "本周精选优惠",
    original_url: "https://download.suspicious-cdn.net/file.zip",
    rewritten_url: "https://safelink.gateway.com/r/5c1f88",
    client_ip: "192.0.2.130",
    click_source: "attachment",
    trigger_stage: "phishing_agent",
    verdict: "suspicious",
    detail: "URL沙箱引爆：页面尝试下载可疑可执行文件",
    final_result: "alerted",
    user_action: "abandoned",
    deep_inspect_state: "done",
    tenant_id: 3,
    tenant_name: "待配置租户 C",
  },
  {
    id: 4,
    log_id: "TID20251103004",
    message_id: "TID20251103004",
    occurred_at: "2025-11-03T08:55:09+08:00",
    clicker: "dave@company.com",
    sender: "hr@partner-corp.com",
    subject: "入职材料确认",
    original_url: "https://partner-corp.com/onboarding",
    rewritten_url: "https://safelink.gateway.com/r/7d44a2",
    client_ip: "203.0.113.88",
    click_source: "body",
    trigger_stage: "phishing_agent",
    verdict: "phishing",
    detail: "钓鱼邮件智能体研判：页面仿冒企业登录页，意图窃取凭证",
    final_result: "alerted",
    user_action: "proceeded",
    deep_inspect_state: "done",
    tenant_id: 1,
    tenant_name: "示例租户 A",
  },
  {
    id: 5,
    log_id: "TID20251103005",
    message_id: "TID20251103005",
    occurred_at: "2025-11-03T08:30:44+08:00",
    clicker: "erin@company.com",
    sender: "support@legitimate-shop.com",
    subject: "您的订单已发货",
    original_url: "https://legitimate-shop.com/orders/10293",
    rewritten_url: "https://safelink.gateway.com/r/1a9b6e",
    client_ip: "198.51.100.77",
    click_source: "body",
    trigger_stage: "none",
    verdict: "safe",
    detail: "三个环节均未命中，链接安全放行",
    final_result: "passed",
    user_action: "none",
    tenant_id: 2,
    tenant_name: "示例租户 B",
  },
  {
    id: 6,
    log_id: "TID20251103006",
    message_id: "TID20251103006",
    occurred_at: "2025-11-03T07:52:18+08:00",
    clicker: "frank@company.com",
    sender: "docs@vendor-portal.com",
    subject: "合同文件待查阅",
    original_url: "https://vendor-portal.com/contract/8842",
    rewritten_url: "https://safelink.gateway.com/r/6e2d94",
    client_ip: "203.0.113.201",
    click_source: "body",
    trigger_stage: "phishing_agent",
    verdict: "suspicious",
    detail: "深度复检进行中，用户在等待期间二次确认风险后主动跳过检测直接访问",
    final_result: "passed",
    user_action: "skipped_deep_inspect",
    deep_inspect_state: "user_skipped",
    tenant_id: 3,
    tenant_name: "待配置租户 C",
  },
];

// GET /link-click-logs：多条件 AND（文本子串、枚举精确、时间区间）+ 分页 +
// X-Tenant-ID 租户作用域，与网关 handler 的查询参数一一对应（html_spec §4.3）。
export function mockLinkClickLogsList(
  query: string,
  headers?: Record<string, string>,
): { items: LinkClickLog[]; total: number; page: number; page_size: number } {
  const q = new URLSearchParams(query);
  const text = (k: string) => (q.get(k) ?? "").trim().toLowerCase();
  const exact = (k: string) => (q.get(k) ?? "").trim();
  const tenantHeader =
    headers?.["X-Tenant-ID"] ?? headers?.["x-tenant-id"] ?? "";

  let rows = mockLinkClickLogs.filter((r) => {
    if (text("message_id") && !r.message_id.toLowerCase().includes(text("message_id"))) return false;
    if (text("clicker") && !r.clicker.toLowerCase().includes(text("clicker"))) return false;
    if (text("sender") && !(r.sender ?? "").toLowerCase().includes(text("sender"))) return false;
    if (text("src_url") && !r.original_url.toLowerCase().includes(text("src_url"))) return false;
    if (exact("trigger_stage") && r.trigger_stage !== exact("trigger_stage")) return false;
    if (exact("final_result") && r.final_result !== exact("final_result")) return false;
    if (exact("user_action") && r.user_action !== exact("user_action")) return false;
    if (exact("click_source") && r.click_source !== exact("click_source")) return false;
    if (exact("deep_inspect_state") && r.deep_inspect_state !== exact("deep_inspect_state")) return false;
    if (exact("start") && new Date(r.occurred_at) < new Date(exact("start"))) return false;
    if (exact("end") && new Date(r.occurred_at) > new Date(exact("end"))) return false;
    if (tenantHeader && String(r.tenant_id) !== tenantHeader) return false;
    return true;
  });

  const page = Math.max(1, Number(q.get("page") || 1));
  const pageSize = Math.max(1, Number(q.get("page_size") || 100));
  const total = rows.length;
  rows = rows.slice((page - 1) * pageSize, page * pageSize);
  return { items: rows, total, page, page_size: pageSize };
}

// GET /link-click-logs/:id/download：��条留证导出（返回整行 JSON）。
export function mockLinkClickLogById(id: number): LinkClickLog | undefined {
  return mockLinkClickLogs.find((r) => r.id === id);
}

// ─── 认证日志（logs-auth-logs html_spec）────────────────────────────────────
// 数据逐字段照抄 demo design/origin/demo/components/auth-logs/types.ts 的
// MOCK_AUTH_LOGS（15 行：4 成功 / 11 失败，成功率 26.7%），换算为后端
// AuthAttempt 契约（snake_case、结构化 ip_location、数值 matched_config_id）。
// attempted_at 用无时区 ISO（按本地时区渲染），保证 Mock 模式下与 demo 的
// 展示时间逐字符一致。

const AUTH_TENANTS = [
  { id: 1, name: "示例租户 A" },
  { id: 2, name: "示例租户 B" },
];

function authRow(
  i: number,
  time: string,
  success: boolean,
  username: string,
  protocol: string,
  scene: string,
  domain: string,
  serverHost: string,
  serverPort: number,
  ssl: boolean,
  ip: string,
  loc: { kind: string; region?: string },
  configId: number,
  duration: number,
  failReason?: string,
): AuthAttempt {
  const tenant = AUTH_TENANTS[(i - 1) % AUTH_TENANTS.length];
  return {
    id: i,
    log_id: `AL20260622${String(i).padStart(3, "0")}`,
    attempted_at: time.replace(" ", "T"),
    success,
    username,
    client_ip: ip,
    auth_protocol: protocol,
    scene,
    domain,
    server_host: serverHost,
    server_port: serverPort,
    ssl_enabled: ssl,
    ip_location: loc,
    matched_config_id: configId,
    duration,
    fail_reason_code: failReason,
    failure_reason: failReason,
    tenant_id: tenant.id,
    tenant_name: tenant.name,
  };
}

const NEI = { kind: "internal" };

export const mockAuthAttempts: AuthAttempt[] = [
  authRow(1, "2026-06-22 10:30:45", true, "alice@example.cn", "LDAP", "userspace", "example.cn", "ldap.example.cn", 389, false, "192.168.1.22", NEI, 6001, 86),
  authRow(2, "2026-06-22 10:29:10", false, "user01@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.66", { kind: "overseas", region: "美国" }, 6002, 120, "wrongPassword"),
  authRow(3, "2026-06-22 10:29:02", false, "user01@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.66", { kind: "overseas", region: "美国" }, 6002, 118, "wrongPassword"),
  authRow(4, "2026-06-22 10:28:55", false, "user01@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.66", { kind: "overseas", region: "美国" }, 6002, 121, "wrongPassword"),
  authRow(5, "2026-06-22 10:28:47", false, "user01@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.66", { kind: "overseas", region: "美国" }, 6002, 119, "wrongPassword"),
  authRow(6, "2026-06-22 10:28:39", false, "user01@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.66", { kind: "overseas", region: "美国" }, 6002, 123, "wrongPassword"),
  authRow(7, "2026-06-22 10:28:31", false, "user01@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.66", { kind: "overseas", region: "美国" }, 6002, 90, "accountLocked"),
  authRow(8, "2026-06-22 10:20:12", true, "bob@mail.example.cn", "IMAP", "mailsync", "mail.example.cn", "imap.example.cn", 993, true, "192.168.3.40", NEI, 6003, 142),
  authRow(9, "2026-06-22 10:15:08", false, "scan001@example.cn", "LDAP", "userspace", "example.cn", "ldap.example.cn", 389, false, "198.51.100.7", { kind: "overseas", region: "荷兰" }, 6001, 65, "userNotExist"),
  authRow(10, "2026-06-22 10:12:33", false, "carol@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "203.0.113.90", { kind: "overseas", region: "德国" }, 6002, 230, "certError"),
  authRow(11, "2026-06-22 10:05:19", false, "dave@example.cn", "IMAP", "mailsync", "mail.example.cn", "imap.example.cn", 993, true, "10.0.0.55", NEI, 6003, 25000, "serverTimeout"),
  authRow(12, "2026-06-22 09:58:44", true, "erin@example.cn", "LDAP", "userspace", "example.cn", "ldap.example.cn", 389, false, "192.168.1.31", NEI, 6001, 78),
  authRow(13, "2026-06-22 09:50:02", false, "frank@example.cn", "POP3", "mailsync", "example.cn", "pop.example.cn", 995, true, "203.0.113.120", { kind: "overseas", region: "法国" }, 6003, 50, "connectionRefused"),
  authRow(14, "2026-06-22 09:45:38", false, "grace@example.cn", "SMTP", "smtpsend", "example.cn", "smtp.example.cn", 465, true, "192.168.2.18", NEI, 6002, 60, "protocolMismatch"),
  authRow(15, "2026-06-22 09:30:51", true, "heidi@example.cn", "LDAP", "userspace", "example.cn", "ldap.example.cn", 389, false, "192.168.1.44", NEI, 6001, 92),
];

function containsCI(haystack: string | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

export function mockAuthAttemptsList(query: {
  page?: number;
  page_size?: number;
  keyword?: string;
  username?: string;
  client_ip?: string;
  success?: boolean;
  auth_protocol?: string;
  scene?: string;
  domain?: string;
  fail_reason?: string;
}) {
  let items = [...mockAuthAttempts];
  if (query.keyword) {
    const kw = query.keyword;
    items = items.filter((r) => containsCI(r.username, kw) || containsCI(r.client_ip, kw));
  }
  if (query.username) items = items.filter((r) => containsCI(r.username, query.username!));
  if (query.client_ip) items = items.filter((r) => containsCI(r.client_ip, query.client_ip!));
  if (query.success !== undefined) items = items.filter((r) => r.success === query.success);
  if (query.auth_protocol) items = items.filter((r) => r.auth_protocol === query.auth_protocol);
  if (query.scene) items = items.filter((r) => r.scene === query.scene);
  if (query.domain) items = items.filter((r) => containsCI(r.domain, query.domain!));
  if (query.fail_reason) items = items.filter((r) => r.fail_reason_code === query.fail_reason);
  const page = query.page || 1;
  const pageSize = query.page_size || 50;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

// 统计口径 = 全量数据集（PRD 明确不随筛选变化）
export function mockAuthAttemptStatsData(): AuthAttemptStats {
  const total = mockAuthAttempts.length;
  const success = mockAuthAttempts.filter((r) => r.success).length;
  return { total, success, failed: total - success };
}

// ==================== 组织通讯录（admin-contacts html_spec）====================
// fixture 数据逐值照抄 demo components/admin/contacts/types.ts 的 MOCK_*，
// 保证 Mock 模式下 webapp 渲染的 DOM 与 demo 逐字段一致。
// 状态化：数据源 CRUD/同步状态机/测试交替、人员标记，均在模块级可变��组上进行。

interface MockContactSourceRow {
  id: number;
  tenant_id: number;
  name: string;
  source_type: 'ldap' | 'csv' | 'coremail' | 'neteml';
  priority: number;
  auto_sync_enabled: boolean;
  cron_expr: string;
  sync_mode: string;
  conflict_policy: string;
  sync_status: string;
  abnormal_count?: number;
  last_sync_time: string | null;
  updated_at: string;
  secret_present: boolean;
  config: Record<string, unknown>;
}

const contactSources: MockContactSourceRow[] = [
  { id: 3, tenant_id: 1, name: '总部 AD', source_type: 'ldap', priority: 100, auto_sync_enabled: true, cron_expr: '0 0 * * *', sync_mode: 'full', conflict_policy: 'priority', sync_status: 'success', last_sync_time: '2026-06-18T09:12:00', updated_at: '2026-06-18T09:12:00Z', secret_present: true, config: { server: 'ldap.corp.com', port: 389, base_dn: 'dc=corp,dc=com', bind_dn: 'cn=admin,dc=corp,dc=com', bind_password: '********' } },
  { id: 5, tenant_id: 1, name: '邮件系统', source_type: 'coremail', priority: 80, auto_sync_enabled: false, cron_expr: '', sync_mode: 'full', conflict_policy: 'priority', sync_status: 'success', last_sync_time: '2026-06-18T08:55:00', updated_at: '2026-06-18T08:55:00Z', secret_present: true, config: { server_url: 'https://api.coremail.cn', account: 'admin', password: '********' } },
  { id: 11, tenant_id: 1, name: '网易企邮', source_type: 'neteml', priority: 60, auto_sync_enabled: true, cron_expr: '0 0 * * *', sync_mode: 'full', conflict_policy: 'priority', sync_status: 'partial', abnormal_count: 2, last_sync_time: '2026-06-18T07:30:00', updated_at: '2026-06-18T07:30:00Z', secret_present: true, config: { server_url: 'https://api.qiye.163.com', corp_domain: 'corp.cn', app_id: 'app-8821', open_id: 'open-3391', auth_code: '********' } },
  { id: 13, tenant_id: 1, name: '研发 CSV', source_type: 'csv', priority: 40, auto_sync_enabled: false, cron_expr: '', sync_mode: 'full', conflict_policy: 'priority', sync_status: 'unsynced', last_sync_time: null, updated_at: '2026-06-17T10:00:00Z', secret_present: false, config: { org_id: 'RD-001' } },
  { id: 15, tenant_id: 1, name: '分支机构 LDAP', source_type: 'ldap', priority: 30, auto_sync_enabled: false, cron_expr: '', sync_mode: 'full', conflict_policy: 'priority', sync_status: 'failed', last_sync_time: '2026-06-17T22:01:00', updated_at: '2026-06-17T22:01:00Z', secret_present: true, config: { server: 'ldap.branch.com', port: 636, base_dn: 'dc=branch,dc=com', bind_dn: 'cn=svc,dc=branch,dc=com', bind_password: '********' } },
];
let contactSourceNextId = 21; // demo genId 序列从 21 起

interface MockContactRow {
  id: number;
  source_id: number;
  source_name: string;
  email: string;
  display_name: string;
  department_path: string;
  job_title: string;
  tag: 'none' | 'executive' | 'key_position';
  status: 'active';
  email_alias: string;
}

const contactPeople: MockContactRow[] = [
  { id: 1, source_id: 3, source_name: '总部 AD', department_path: '研发部 / 后端组', display_name: '张三', email: 'zhangsan@corp.cn', job_title: '工程师', tag: 'executive', status: 'active', email_alias: '张三.alias@corp.cn' },
  { id: 2, source_id: 3, source_name: '总部 AD', department_path: '财务部', display_name: '李四', email: 'lisi@corp.cn', job_title: '总监', tag: 'key_position', status: 'active', email_alias: '李四.alias@corp.cn' },
  { id: 3, source_id: 3, source_name: '总部 AD', department_path: '研发部 / 前端组', display_name: '王五', email: 'wangwu@corp.cn', job_title: '工程师', tag: 'none', status: 'active', email_alias: '王五.alias@corp.cn' },
  { id: 4, source_id: 5, source_name: '邮件系统', department_path: '市场部', display_name: '赵六', email: 'zhaoliu@corp.cn', job_title: '经理', tag: 'none', status: 'active', email_alias: '赵六.alias@corp.cn' },
  { id: 5, source_id: 11, source_name: '网易企邮', department_path: '总裁办', display_name: '陈总', email: 'chenzong@corp.cn', job_title: '首席执行官', tag: 'executive', status: 'active', email_alias: '陈总.alias@corp.cn' },
  { id: 6, source_id: 11, source_name: '网易企邮', department_path: '人力资源部', display_name: '孙七', email: 'sunqi@corp.cn', job_title: 'HRBP', tag: 'none', status: 'active', email_alias: '孙七.alias@corp.cn' },
  { id: 7, source_id: 5, source_name: '邮件系统', department_path: '销售部 / 华东区', display_name: '周八', email: 'zhouba@corp.cn', job_title: '区域总监', tag: 'key_position', status: 'active', email_alias: '周八.alias@corp.cn' },
  { id: 8, source_id: 3, source_name: '总部 AD', department_path: '法务部', display_name: '吴九', email: 'wujiu@corp.cn', job_title: '法务专员', tag: 'none', status: 'active', email_alias: '吴九.alias@corp.cn' },
];

interface MockSyncLogRow {
  id: number;
  source_id: number;
  sync_type: 'auto' | 'manual';
  sync_mode: string;
  status: string;
  added_count: number;
  updated_count: number;
  deleted_count: number;
  failed_count: number;
  total_count: number;
  processed_count: number;
  duration_ms: number;
  started_at: string;
  failures: { id: number; row_no: number; email: string; reason: string }[];
}

const contactSyncLogs: MockSyncLogRow[] = [
  { id: 1024, source_id: 3, sync_type: 'auto', sync_mode: 'full', status: 'success', added_count: 15, updated_count: 3, deleted_count: 0, failed_count: 0, total_count: 18, processed_count: 18, duration_ms: 2300, started_at: '2026-06-18T09:12:01', failures: [] },
  { id: 1023, source_id: 11, sync_type: 'manual', sync_mode: 'full', status: 'partial', added_count: 0, updated_count: 0, deleted_count: 0, failed_count: 2, total_count: 2, processed_count: 2, duration_ms: 5100, started_at: '2026-06-18T07:30:00', failures: [ { id: 1, row_no: 12, email: 'bad@@corp.cn', reason: '邮箱格式非法' }, { id: 2, row_no: 45, email: 'dup@corp.cn', reason: '邮箱重复，已跳过' } ] },
  { id: 1022, source_id: 5, sync_type: 'auto', sync_mode: 'full', status: 'success', added_count: 8, updated_count: 12, deleted_count: 1, failed_count: 0, total_count: 21, processed_count: 21, duration_ms: 3700, started_at: '2026-06-18T08:55:10', failures: [] },
  { id: 1021, source_id: 15, sync_type: 'manual', sync_mode: 'full', status: 'failed', added_count: 0, updated_count: 0, deleted_count: 0, failed_count: 0, total_count: 0, processed_count: 0, duration_ms: 30000, started_at: '2026-06-17T22:01:30', failures: [ { id: 3, row_no: 0, email: '-', reason: '连接超时，请检查网络或服务器地址' } ] },
];

function mockNowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// fixtures 状态是原地可变的（同步状态机 1.5s 后改写同一对象）；返回深拷贝，
// 否则 react-query 拿到同一引用会因结构共享/引用相等而不触发重渲染。
function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function mockContactSourcesList(query: {
  search?: string;
  source_type?: string;
  sync_status?: string;
  auto_sync?: string;
  page?: number;
  page_size?: number;
}) {
  let items = contactSources.slice();
  if (query.search) {
    const kw = query.search.toLowerCase();
    items = items.filter((s) => {
      const addr = String(s.config.server ?? s.config.server_url ?? '');
      return s.name.toLowerCase().includes(kw) || addr.toLowerCase().includes(kw);
    });
  }
  // GT-12038：后端 list 支持 source_type / sync_status / auto_sync 筛选。
  if (query.source_type) items = items.filter((s) => s.source_type === query.source_type);
  if (query.sync_status) items = items.filter((s) => s.sync_status === query.sync_status);
  if (query.auto_sync) items = items.filter((s) => String(s.auto_sync_enabled) === query.auto_sync);
  const page = query.page || 1;
  const pageSize = query.page_size || 20;
  return { items: deepClone(items.slice((page - 1) * pageSize, page * pageSize)), total: items.length, page, page_size: pageSize };
}

export function mockContactSourceCreate(body: Record<string, unknown>) {
  const row: MockContactSourceRow = {
    id: contactSourceNextId++,
    tenant_id: 1,
    name: String(body.name ?? ''),
    source_type: (body.source_type as MockContactSourceRow['source_type']) ?? 'ldap',
    priority: Number(body.priority ?? 50),
    auto_sync_enabled: Boolean(body.auto_sync_enabled),
    cron_expr: String(body.cron_expr ?? ''),
    sync_mode: String(body.sync_mode ?? 'full'),
    conflict_policy: String(body.conflict_policy ?? 'priority'),
    sync_status: 'unsynced',
    last_sync_time: null,
    updated_at: mockNowStamp(),
    secret_present: true,
    config: (body.config as Record<string, unknown>) ?? {},
  };
  contactSources.unshift(row); // demo 新增置顶
  return deepClone(row);
}

export function mockContactSourceUpdate(id: number, body: Record<string, unknown>) {
  const row = contactSources.find((s) => s.id === id);
  if (!row) return null;
  row.name = String(body.name ?? row.name);
  row.source_type = (body.source_type as MockContactSourceRow['source_type']) ?? row.source_type;
  if (body.priority !== undefined) row.priority = Number(body.priority);
  if (body.auto_sync_enabled !== undefined) row.auto_sync_enabled = Boolean(body.auto_sync_enabled);
  if (body.cron_expr !== undefined) row.cron_expr = String(body.cron_expr);
  if (body.sync_mode !== undefined) row.sync_mode = String(body.sync_mode);
  if (body.conflict_policy !== undefined) row.conflict_policy = String(body.conflict_policy);
  if (body.config !== undefined) row.config = body.config as Record<string, unknown>;
  row.updated_at = mockNowStamp();
  return deepClone(row);
}

export function mockContactSourceDelete(id: number) {
  const i = contactSources.findIndex((s) => s.id === id);
  if (i >= 0) contactSources.splice(i, 1);
}

// GT-12034：自动同步开关走专用端点（列表 config 已脱敏，不能整体回传）。
export function mockContactSourceSetAutoSync(id: number, body: { enabled?: boolean; cron_expr?: string }) {
  const row = contactSources.find((s) => s.id === id);
  if (!row) return null;
  row.auto_sync_enabled = Boolean(body.enabled);
  if (body.enabled && body.cron_expr) row.cron_expr = body.cron_expr;
  row.updated_at = mockNowStamp();
  return deepClone(row);
}

// 测试连接：规格侧口径 —— 确定性交替 成功→���败→成功…，两种��果都能复核。
let contactTestSeq = 0;
export function mockContactSourceTest() {
  contactTestSeq += 1;
  if (contactTestSeq % 2 === 1) {
    return { ok: true, test_token: `mock-test-token-${contactTestSeq}` };
  }
  return { ok: false, info: '超时' };
}

// 行内同步状态机���1.5s 内为「同步中」，之后定态出结果 ——
// 「邮件系统」出 部分异常（2）（与规格截图一致），其余行出 正常。
export function mockContactSourceSync(id: number) {
  const row = contactSources.find((s) => s.id === id);
  if (!row) return { sync_log_id: 0 };
  row.sync_status = 'running';
  setTimeout(() => {
    if (row.name === '邮件系统') {
      row.sync_status = 'partial';
      row.abnormal_count = 2;
    } else {
      row.sync_status = 'success';
      delete row.abnormal_count;
    }
    row.last_sync_time = mockNowStamp();
  }, 1500);
  return { sync_log_id: 9000 + id };
}

export function mockContactsList(query: { keyword?: string; source_id?: string; tag?: string; page?: number; page_size?: number }) {
  let items = contactPeople.slice();
  if (query.keyword) {
    const kw = query.keyword.toLowerCase();
    items = items.filter((p) => p.display_name.toLowerCase().includes(kw) || p.email.toLowerCase().includes(kw));
  }
  if (query.source_id) items = items.filter((p) => p.source_id === Number(query.source_id));
  if (query.tag) items = items.filter((p) => p.tag === query.tag);
  const page = query.page || 1;
  const pageSize = query.page_size || 20;
  return { items: deepClone(items.slice((page - 1) * pageSize, page * pageSize)), total: items.length, page, page_size: pageSize };
}

export function mockContactsBulk(body: { action?: string; tag?: string; ids?: number[] }) {
  const ids = new Set(body.ids ?? []);
  let updated = 0;
  for (const p of contactPeople) {
    if (!ids.has(p.id)) continue;
    p.tag = body.action === 'untag' ? 'none' : ((body.tag as MockContactRow['tag']) ?? 'none');
    updated += 1;
  }
  return { updated };
}

export function mockContactSyncLogsList(query: { sync_type?: string; status?: string; source_id?: string; page?: number; page_size?: number }) {
  let items = contactSyncLogs.slice();
  if (query.sync_type) items = items.filter((l) => l.sync_type === query.sync_type);
  if (query.status) items = items.filter((l) => l.status === query.status);
  if (query.source_id) items = items.filter((l) => l.source_id === Number(query.source_id));
  const page = query.page || 1;
  const pageSize = query.page_size || 20;
  return {
    items: deepClone(items.slice((page - 1) * pageSize, page * pageSize).map(({ failures: _failures, ...rest }) => rest)),
    total: items.length,
    page,
    page_size: pageSize,
  };
}

export function mockContactSyncLogDetail(id: number) {
  const log = contactSyncLogs.find((l) => l.id === id);
  if (!log) return null;
  const { failures, ...rest } = log;
  return deepClone({ ...rest, failures: { items: failures, total: failures.length, page: 1, page_size: 200 } });
}

// CSV 上传/预览（Mock 模式下由 organization/api.ts ���路调用）
export function mockContactCSVUpload() {
  return { upload_token: 'mock-upload-token', user_file_ref: 'mock-user.csv', headers: ['邮箱', '姓名', '部门', '职务'] };
}
export function mockContactCSVPreview() {
  return { headers: ['邮箱', '姓名', '部门', '职务'], rows: [], test_token: 'mock-csv-test-token', valid: true };
}

// 投递与流量分析：数值以 demo 的默认「���部租户 / 近7日」为基线；指定租户时
// 只缩放数量，比例与延迟保持不变，便于验证租户切换确实刷新整页。
function makeDeliveryRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function deliveryHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Resolve how many calendar days a [startDate, endDate] range spans (inclusive). */
function deliverySpanDays(startDate: string, endDate: string): number {
  const s = Date.parse(startDate);
  const e = Date.parse(endDate);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 7;
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Whether start === end (i.e. "today" single-day view). */
function deliveryIsToday(startDate: string, endDate: string): boolean {
  return Boolean(startDate) && startDate === endDate;
}

export function mockDeliveryTrafficFor(
  direction: Direction,
  tenantId: number | null,
  startDate = '',
  endDate = '',
): DeliveryTrafficResponse {
  const scale = tenantId && tenantId > 0 ? 0.16 + (tenantId % 5) * 0.04 : 1;
  const n = (value: number) => Math.max(0, Math.round(value * scale));

  const isToday = deliveryIsToday(startDate, endDate);
  const spanDays = isToday ? 1 : deliverySpanDays(startDate, endDate);

  // Use (startDate + endDate) as part of the seed so every time range renders
  // visually distinct data while remaining stable across re-renders.
  const rangeSeed = deliveryHash(`${startDate}:${endDate}`);

  const isoDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // For "today": 24 hourly points (00:00 – 23:00).
  // For multi-day: one point per calendar day.
  const trendRng = makeDeliveryRng(rangeSeed ^ deliveryHash('trend'));

  let trendPoints: Array<{ date: string; receive: number; send: number; internal: number; receive_success: number; send_success: number; internal_success: number }>;
  let dates: string[];

  if (isToday) {
    const todayDate = startDate || isoDate(new Date());
    trendPoints = Array.from({ length: 24 }, (_, hour) => {
      const value = (max: number, min: number) =>
        Math.max(0, Math.floor((trendRng() * max + min) * scale * (1 / 24)));
      return {
        date: `${String(hour).padStart(2, '0')}:00`,
        receive: value(5000, 8000),
        send: value(3000, 4000),
        internal: value(2000, 1500),
        receive_success: value(4800, 7500),
        send_success: value(2800, 3700),
        internal_success: value(1900, 1400),
      };
    });
    dates = [todayDate];
  } else {
    const startMs = startDate ? Date.parse(startDate) : Date.now() - (spanDays - 1) * 86_400_000;
    const dateValues = Array.from({ length: spanDays }, (_, index) => {
      const d = new Date(startMs + index * 86_400_000);
      return d;
    });
    dates = dateValues.map(isoDate);
    trendPoints = dateValues.map((date) => {
      const value = (max: number, min: number) =>
        Math.max(0, Math.floor((trendRng() * max + min) * scale));
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        receive: value(5000, 8000),
        send: value(3000, 4000),
        internal: value(2000, 1500),
        receive_success: value(4800, 7500),
        send_success: value(2800, 3700),
        internal_success: value(1900, 1400),
      };
    });
  }

  const detail = (kind: Direction, seedDirection = kind): DetailTableRow[] => {
    const demoDirection =
      seedDirection === 'receive' ? 'inbound' : seedDirection === 'send' ? 'outbound' : seedDirection;
    const rng = makeDeliveryRng(rangeSeed ^ deliveryHash(`detail:${demoDirection}`));
    // For today, collapse all 24 hours into a single summary row.
    const detailDates = isToday ? (dates.length > 0 ? [dates[0]] : []) : dates.slice().reverse();
    return detailDates.map((date): DetailTableRow => {
      const dayMultiplier = isToday ? 1 : 1;
      if (kind === 'internal') {
        const total = Math.floor((rng() * 2000 + 1500) * scale * dayMultiplier);
        const success = Math.floor(total * 0.98);
        const failure = Math.floor(total * 0.015);
        return {
          date, total, success, failure,
          internal_spam: Math.floor((rng() * 20 + 5) * scale),
          internal_phishing: Math.floor((rng() * 10 + 2) * scale),
          internal_virus: Math.floor((rng() * 5 + 1) * scale),
          success_rate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 0,
          change: Number((rng() * 10 - 5).toFixed(1)),
        };
      }

      const outbound = kind === 'send';
      const total = Math.floor((rng() * (outbound ? 3000 : 5000) + (outbound ? 4000 : 8000)) * scale * dayMultiplier);
      const success = Math.floor(total * (outbound ? 0.92 : 0.95));
      const failure = Math.floor(total * (outbound ? 0.05 : 0.03));
      const deferred = Math.floor(total * (outbound ? 0.02 : 0.015));
      const cancelled = total - success - failure - deferred;
      const common = {
        date, total, success, failure, deferred, cancelled,
        success_rate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 0,
        change: Number((rng() * 10 - 5).toFixed(1)),
      };
      if (outbound) return {
        ...common,
        target_reject: Math.floor(failure * 0.4),
        dns_fail: Math.floor(failure * 0.25),
        rbl_block: Math.floor(failure * 0.15),
      };
      return {
        ...common,
        user_not_exist: Math.floor(failure * 0.6),
        mailbox_full: Math.floor(failure * 0.3),
      };
    });
  };

  if (direction === 'all') {
    return {
      kpi: { inbound_total: n(89234), outbound_total: n(45678), internal_total: n(12345), total_success_rate: 96.5, queue_backlog: n(1234), trends: { totalSuccessRate: 1.2, queueBacklog: -5.3 } },
      trend: { points: trendPoints, granularity: isToday ? 'hour' : 'day' } as DeliveryTrafficResponse['trend'] & { granularity: string },
      distribution: [{ name: 'receive', value: n(89234) }, { name: 'send', value: n(45678) }, { name: 'internal', value: n(12345) }],
      latency: { buckets: [] },
      detail_table: detail('receive', 'all'),
      generated_at: new Date().toISOString(),
      data_lag_seconds: 420,
    };
  }

  const trend = {
    points: trendPoints.map((point) => ({ date: point.date, total: point[direction] as number })),
    granularity: isToday ? 'hour' : 'day',
  } as DeliveryTrafficResponse['trend'] & { granularity: string };

  if (direction === 'receive') {
    return {
      kpi: { total: n(89234), success_rate: 97.2, bounce_rate: 2.1, avg_latency_ms: 1200, sideline_queue: n(234), trends: { successRate: 0.5, bounceRate: -0.3 } },
      trend,
      distribution: [{ name: 'user_not_exist', value: n(1234) }, { name: 'mailbox_full', value: n(567) }, { name: 'policy_reject', value: n(234) }],
      latency: { buckets: [] },
      detail_table: detail('receive'),
      generated_at: new Date().toISOString(), data_lag_seconds: 420,
    };
  }

  if (direction === 'send') {
    return {
      kpi: { total: n(45678), success_rate: 94.8, bounce_rate: 3.5, latency_p99_ms: 28500, queue_backlog_approx: n(876), trends: { successRate: -0.8, bounceRate: 0.5, outboundQueueBacklog: 12.3 } },
      trend,
      distribution: [
        { name: 'gmail.com', value: 5.2, count: n(320) }, { name: 'qq.com', value: 3.8, count: n(245) },
        { name: 'outlook.com', value: 2.1, count: n(156) }, { name: 'yahoo.com', value: 1.9, count: n(134) }, { name: '163.com', value: 1.5, count: n(98) },
      ],
      latency: { percentiles: dates.map((date, i) => ({ date, p50: 850 + i * 30, p90: 6200 + i * 120, p99: 24500 + i * 600 })), buckets: [] },
      queue_trend: dates.map((date, i) => ({ date, count: n(520 + i * 57) })),
      detail_table: detail('send'),
      generated_at: new Date().toISOString(), data_lag_seconds: 420,
    };
  }

  return {
    kpi: { total: n(12345), success_rate: 99.1, internal_threat_count: n(156), threat_rate: 0.08, avg_latency_ms: 45, trends: { successRate: 0.2 } },
    trend,
    distribution: [{ name: 'internal_spam', value: 45 }, { name: 'internal_phishing', value: 25 }, { name: 'internal_virus', value: 15 }],
    latency: { buckets: [
      { name: '0-100ms', value: 85, count: n(8500), percent: 85, threshold: 80, healthy: true },
      { name: '100-500ms', value: 12, count: n(1200), percent: 12, threshold: 15, healthy: true },
      { name: '500ms-1s', value: 2.5, count: n(250), percent: 2.5, threshold: 4, healthy: true },
      { name: '>1s', value: 0.5, count: n(50), percent: 0.5, threshold: 1, healthy: true },
    ] },
    detail_table: detail('internal'),
    generated_at: new Date().toISOString(), data_lag_seconds: 420,
  };
}

export function mockDeliveryTrafficCsv(direction: Direction = 'all', startDate = '', endDate = ''): string {
  const spanDays = deliverySpanDays(startDate, endDate);
  const isToday = deliveryIsToday(startDate, endDate);
  const startMs = startDate ? Date.parse(startDate) : Date.now() - (spanDays - 1) * 86_400_000;
  const rng = makeDeliveryRng(deliveryHash(`csv:${direction}:${startDate}:${endDate}`));
  const rows: string[] = ['date,direction,total,success,failure,success_rate'];
  if (isToday) {
    const todayStr = startDate || new Date().toISOString().slice(0, 10);
    for (let hour = 0; hour < 24; hour++) {
      const total = Math.floor(rng() * 600 + 200);
      const success = Math.floor(total * (0.92 + rng() * 0.06));
      const failure = total - success;
      rows.push(`${todayStr} ${String(hour).padStart(2, '0')}:00,${direction},${total},${success},${failure},${((success / total) * 100).toFixed(1)}`);
    }
  } else {
    for (let index = 0; index < spanDays; index++) {
      const d = new Date(startMs + index * 86_400_000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const total = Math.floor(rng() * 15000 + 8000);
      const success = Math.floor(total * (0.92 + rng() * 0.06));
      const failure = total - success;
      rows.push(`${dateStr},${direction},${total},${success},${failure},${((success / total) * 100).toFixed(1)}`);
    }
  }
  return rows.join('\n') + '\n';
}

export function mockDeliveryTrafficAi() {
  return { summary: '整体投递成功率稳定，外发队列需要持续关注，当前没有超过告警阈值。' };
}

// 链接与附件安全：严格复刻 demo 默认「全部租户 / 近7日」数据生成器。
// 页面 mock 需要逐字��与 demo 一致，不能依赖 dispatcher 的空壳 fallback。
function makeLinkAttachmentRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function mockLinkAttachmentStats(): LinkAttachmentStats {
  const linkRng = makeLinkAttachmentRng(1 ^ 1001);
  const attachmentRng = makeLinkAttachmentRng(1 ^ 2002);
  const detailLinkRng = makeLinkAttachmentRng(1 ^ 3003);
  const detailAttachmentRng = makeLinkAttachmentRng(1 ^ 4004);
  const dates = ['05-15', '05-16', '05-17', '05-18', '05-19', '05-20', '05-21'];
  const detailDates = ['2026-05-21', '2026-05-20', '2026-05-19', '2026-05-18', '2026-05-17', '2026-05-16', '2026-05-15'];

  const link = dates.map((date) => ({
    date,
    total_link_mail: Math.floor(linkRng() * 3000 + 8000),
    malicious_link_mail: Math.floor(linkRng() * 300 + 100),
    phishing: Math.floor(linkRng() * 150 + 50),
    malware_download: Math.floor(linkRng() * 80 + 20),
    c2: Math.floor(linkRng() * 30 + 5),
    spam: Math.floor(linkRng() * 100 + 30),
    qr_phishing: Math.floor(linkRng() * 20 + 5),
  }));
  const attachment = dates.map((date) => ({
    date,
    total_attachment_mail: Math.floor(attachmentRng() * 5000 + 10000),
    malicious_attachment_mail: Math.floor(attachmentRng() * 100 + 30),
    virus: Math.floor(attachmentRng() * 40 + 10),
    macro: Math.floor(attachmentRng() * 30 + 8),
    zip_bomb: Math.floor(attachmentRng() * 10 + 2),
    exploit: Math.floor(attachmentRng() * 15 + 3),
    other: Math.floor(attachmentRng() * 10 + 2),
  }));
  const totalLink = link.reduce((sum, item) => sum + item.total_link_mail, 0);
  const maliciousLink = link.reduce((sum, item) => sum + item.malicious_link_mail, 0);
  const totalAttachment = attachment.reduce((sum, item) => sum + item.total_attachment_mail, 0);
  const maliciousAttachment = attachment.reduce((sum, item) => sum + item.malicious_attachment_mail, 0);

  return {
    kpi: {
      total_link_mail: totalLink,
      link_detection_rate: Number(((maliciousLink / totalLink) * 100).toFixed(1)),
      total_attachment_mail: totalAttachment,
      attachment_detection_rate: Number(((maliciousAttachment / totalAttachment) * 100).toFixed(1)),
    },
    trend: { link, attachment },
    link_distributions: {
      type: [
        { key: 'phishing', count: 523, percent: 45 },
        { key: 'malware_download', count: 234, percent: 20 },
        { key: 'c2', count: 117, percent: 10 },
        { key: 'spam', count: 175, percent: 15 },
        { key: 'qr_phishing', count: 117, percent: 10 },
      ],
      reputation: [
        { key: 'high_risk', count: 456, percent: 35 },
        { key: 'medium_risk', count: 312, percent: 24 },
        { key: 'low_risk', count: 195, percent: 15 },
        { key: 'normal', count: 260, percent: 20 },
        { key: 'unknown', count: 78, percent: 6 },
      ],
      click_overview: { total_link_mails: totalLink, clicked_mails: 0, click_rate: 0, total_clicks: 0, threat_clicks: 0, safe_clicks: 0 },
    },
    attachment_distributions: {
      type: [
        { key: 'exe', count: 234, percent: 18 },
        { key: 'doc', count: 456, percent: 35 },
        { key: 'pdf', count: 312, percent: 24 },
        { key: 'zip', count: 156, percent: 12 },
        { key: 'xls', count: 104, percent: 8 },
        { key: 'other', count: 39, percent: 3 },
      ],
      threat_type: [
        { key: 'malicious', count: 89, percent: 12 },
        { key: 'suspicious', count: 156, percent: 21 },
        { key: 'clean', count: 423, percent: 57 },
        { key: 'not_detected', count: 52, percent: 7 },
        { key: 'detecting', count: 22, percent: 3 },
      ],
    },
    detail_table: {
      link: detailDates.map((date) => {
        const total = Math.floor(detailLinkRng() * 3000 + 8000);
        const safe = Math.floor(total * 0.92);
        const malicious = total - safe;
        return {
          date,
          total_link_mail: total,
          safe_link_mail: safe,
          malicious_link_mail: malicious,
          phishing: Math.floor(malicious * 0.45),
          malware_download: Math.floor(malicious * 0.2),
          c2: Math.floor(malicious * 0.1),
          spam: Math.floor(malicious * 0.15),
          qr_phishing: malicious - Math.floor(malicious * 0.45) - Math.floor(malicious * 0.2) - Math.floor(malicious * 0.1) - Math.floor(malicious * 0.15),
          block_rate: Number((95 + detailLinkRng() * 4).toFixed(1)),
          change: Number((detailLinkRng() * 10 - 5).toFixed(1)),
        };
      }),
      attachment: detailDates.map((date) => {
        const total = Math.floor(detailAttachmentRng() * 5000 + 10000);
        const safe = Math.floor(total * 0.985);
        const malicious = total - safe;
        const virus = Math.floor(malicious * 0.4);
        const macro = Math.floor(malicious * 0.3);
        const zipBomb = Math.floor(malicious * 0.1);
        const exploit = Math.floor(malicious * 0.15);
        return {
          date,
          total_attachment_mail: total,
          safe_attachment_mail: safe,
          malicious_attachment_mail: malicious,
          virus,
          macro,
          zip_bomb: zipBomb,
          exploit,
          other: malicious - virus - macro - zipBomb - exploit,
          block_rate: Number((97 + detailAttachmentRng() * 2.5).toFixed(1)),
          change: Number((detailAttachmentRng() * 6 - 3).toFixed(1)),
        };
      }),
    },
    sandbox_async_malicious_count: 7,
  };
}

const linkAttachmentDomains: TopMaliciousDomain[] = [
  ['evil-phish.com', 156, 98.2, '2026-05-10', false],
  ['malware-download.net', 123, 97.5, '2026-05-12', false],
  ['fake-login.org', 98, 99.1, '2026-05-08', true],
  ['spam-promo.xyz', 87, 95.8, '2026-05-15', false],
  ['c2-server.ru', 65, 100, '2026-05-11', true],
  ['phishing-bank.com', 54, 96.3, '2026-05-14', false],
  ['trojan-drop.io', 43, 98.8, '2026-05-09', false],
  ['scam-offer.biz', 38, 94.7, '2026-05-16', false],
  ['ransomware.cc', 32, 100, '2026-05-07', true],
  ['cryptojack.xyz', 28, 97.1, '2026-05-13', false],
].map(([domain, count, blockRate, firstSeen, blacklisted], index) => ({
  rank: index + 1,
  domain: String(domain),
  count: Number(count),
  block_rate: Number(blockRate),
  first_seen: String(firstSeen),
  blacklisted: Boolean(blacklisted),
}));

const linkAttachmentFiles = [
  ['invoice_2026.exe', 'exe', 'AV+Sandbox', 45], ['document.docm', 'doc', 'Sandbox', 38],
  ['report.pdf.exe', 'exe', 'AV', 32], ['data.xlsm', 'xls', 'Sandbox', 28],
  ['archive.zip', 'zip', 'AV+Sandbox', 25], ['setup.exe', 'exe', 'AV', 22],
  ['macro_doc.doc', 'doc', 'Sandbox', 19], ['payment.pdf', 'pdf', 'AV+Sandbox', 16],
  ['compressed.rar', 'zip', 'AV', 14], ['spreadsheet.xlsx', 'xls', 'Sandbox', 12],
] as const;

const linkAttachmentAttachments: TopMaliciousAttachment[] = linkAttachmentFiles.map(([fileName, fileExt, engine, count], index) => {
  const md5 = `${String(index + 1).padStart(2, '0')}a1b2c3d4e5f60718293a4b5c6d7e8`;
  return { rank: index + 1, md5, md5_short: md5.slice(0, 8), file_name: fileName, file_ext: fileExt, threat_type: 'malicious', engine, count, first_seen: '2026-05-10' };
});

export function mockLinkAttachmentDomains(limit = 5) {
  return { items: deepClone(linkAttachmentDomains.slice(0, limit)) };
}

export function mockLinkAttachmentAttachments(limit = 5) {
  return { items: deepClone(linkAttachmentAttachments.slice(0, limit)) };
}

export function mockLinkAttachmentCsv() {
  return 'date,total_link_mail,malicious_link_mail\n2026-05-21,9466,758\n';
}

// ── 管理员操作日志（mock）──────────────────────────────────────────────────
// 值镜像 demo components/admin-logs/types.ts 的 MOCK_ADMIN_LOGS，但 resource_type /
// action 用 webapp 侧后端枚举（taxonomy moduleOf / opTypeMeta 能反解标签）：demo 原型的
// disable/grant/report/recall 等 opType 与 demo module 名不在 webapp 枚举中，故就近取
// update/create/delete/export 等已有 action 与 tenants/users/policy_pipeline 等已有
// resource_type。变更前/后放 { text }（drawer diffText 直出原文），操作摘要�� details.summary。
export const mockAdminAuditLogs: AdminAuditLog[] = [
  { id: 1, operation_id: 'OP20260622001', admin_user_id: 1, username: 'admin', operator_name: '张运维（我）',
    operator_role: 'platform', layer: 'platform', action: 'create', resource_type: 'tenants', resource_id: 5,
    status: 'success', client_ip: '10.8.0.12', ip_location: '内网',
    details: { summary: '新增租户并分配 200 账号配额' }, created_at: '2026-06-22T11:02:15Z' },
  { id: 2, operation_id: 'OP20260622002', admin_user_id: 2, username: 'wangping', operator_name: '王平',
    operator_role: 'platform', layer: 'platform', action: 'update', resource_type: 'security_config',
    status: 'success', client_ip: '10.8.0.20', ip_location: '内网',
    details: { summary: '调整账号锁定阈值' }, before_value: { text: '连续失败 10 次锁定' },
    after_value: { text: '连续失败 5 次锁定' }, created_at: '2026-06-22T10:55:40Z' },
  { id: 3, operation_id: 'OP20260622003', admin_user_id: 1, username: 'admin', operator_name: '张运维（我）',
    operator_role: 'platform', layer: 'platform', action: 'update', resource_type: 'phishing_agent',
    status: 'success', client_ip: '10.8.0.12', ip_location: '内网',
    details: { summary: '为��户开通智能体能力' }, before_value: { text: '未开通' },
    after_value: { text: '已开通 agent-management' }, created_at: '2026-06-22T10:40:08Z' },
  { id: 4, operation_id: 'OP20260622004', admin_user_id: 6, username: 'liyang', operator_name: '李扬',
    operator_role: 'platform', layer: 'platform', action: 'update', resource_type: 'ip_rules',
    status: 'success', client_ip: '10.8.0.31', ip_location: '内网',
    details: { summary: '新增一段允许访问的运维网段' }, before_value: { text: '203.0.113.0/24' },
    after_value: { text: '203.0.113.0/24, 198.51.100.0/24' }, created_at: '2026-06-22T10:22:31Z' },
  { id: 5, operation_id: 'OP20260622005', admin_user_id: 2, username: 'wangping', operator_name: '王平',
    operator_role: 'platform', layer: 'platform', action: 'export', resource_type: 'mail_logs',
    status: 'success', client_ip: '10.8.0.20', ip_location: '内网',
    details: { summary: '导出 CSV 报表' }, created_at: '2026-06-22T09:58:12Z' },
  { id: 6, operation_id: 'OP20260622006', admin_user_id: 6, username: 'liyang', operator_name: '李扬',
    operator_role: 'platform', layer: 'platform', action: 'update', resource_type: 'security_config',
    status: 'success', client_ip: '10.8.0.31', ip_location: '内网',
    details: { summary: '对蓝海物流集团强制启用二次认证' }, before_value: { text: '未强制' },
    after_value: { text: '强制开启' }, created_at: '2026-06-22T09:30:45Z' },
  { id: 7, operation_id: 'OP20260622007', admin_user_id: 1, username: 'admin', operator_name: '张运维（我）',
    operator_role: 'platform', layer: 'platform', action: 'update', resource_type: 'tenants', resource_id: 6,
    status: 'failed', error_message: '存在未结清工单，暂停操作被业务校验拦截',
    client_ip: '10.8.0.12', ip_location: '内网', details: { summary: '因欠费暂停租户' },
    before_value: { text: 'active' }, after_value: { text: 'suspended' }, created_at: '2026-06-22T09:12:03Z' },
  { id: 22, operation_id: 'OP20260622008', admin_user_id: 2, username: 'wangping', operator_name: '王平',
    operator_role: 'platform', layer: 'platform', action: 'export', resource_type: 'security_config',
    status: 'success', client_ip: '10.8.0.20', ip_location: '内网',
    details: { summary: '生成月度安全态势报告并归档' }, created_at: '2026-06-22T08:50:27Z' },
  { id: 8, operation_id: 'OP20260622010', admin_user_id: 3, username: 'chenjing@lanhai.cn', operator_name: '陈静（我）',
    operator_role: 'tenant', layer: 'tenant', tenant_id: 2, tenant_name: '蓝海物流集团', action: 'create',
    resource_type: 'users', status: 'success', client_ip: '112.65.1.18', ip_location: '上海',
    details: { summary: '新增一名安全审计管理员' }, created_at: '2026-06-22T11:10:22Z' },
  { id: 9, operation_id: 'OP20260622011', admin_user_id: 4, username: 'sunqi@lanhai.cn', operator_name: '孙琦',
    operator_role: 'tenant', layer: 'tenant', tenant_id: 2, tenant_name: '蓝海物流集团', action: 'update',
    resource_type: 'policy_pipeline', status: 'success', client_ip: '112.65.1.30', ip_location: '上海',
    details: { summary: '提升垃圾邮件判定灵敏度' }, before_value: { text: '中' }, after_value: { text: '高' },
    created_at: '2026-06-22T10:48:50Z' },
  { id: 10, operation_id: 'OP20260622012', admin_user_id: 3, username: 'chenjing@lanhai.cn', operator_name: '陈静（我）',
    operator_role: 'tenant', layer: 'tenant', tenant_id: 2, tenant_name: '蓝海物流集团', action: 'update',
    resource_type: 'policy_pipeline', status: 'success', client_ip: '112.65.1.18', ip_location: '上海',
    details: { summary: '钓鱼邮件处置由隔离改为直接拒收' }, before_value: { text: '隔离' }, after_value: { text: '拒收' },
    created_at: '2026-06-22T10:15:36Z' },
  { id: 14, operation_id: 'OP20260622016', admin_user_id: 4, username: 'sunqi@lanhai.cn', operator_name: '孙琦',
    operator_role: 'tenant', layer: 'tenant', tenant_id: 2, tenant_name: '蓝海物流集团', action: 'create',
    resource_type: 'exec_impersonation', status: 'failed', error_message: '该邮箱已存在于保护名单，重复添加被拒绝',
    client_ip: '112.65.1.30', ip_location: '上海', details: { summary: '新增高管防仿冒保护对象' },
    created_at: '2026-06-22T08:05:17Z' },
  { id: 15, operation_id: 'OP20260622020', admin_user_id: 7, username: 'limin@example.cn', operator_name: '黎敏',
    operator_role: 'tenant', layer: 'tenant', tenant_id: 1, tenant_name: '晨星科技', action: 'update',
    resource_type: 'attachment_security', status: 'success', client_ip: '58.32.10.4', ip_location: '上海',
    details: { summary: '新增可执行文件后缀拦截' }, before_value: { text: 'exe, bat' },
    after_value: { text: 'exe, bat, js, vbs' }, created_at: '2026-06-22T11:05:01Z' },
  { id: 20, operation_id: 'OP20260622040', admin_user_id: 8, username: 'guoqiang@hengfeng.cn', operator_name: '郭强',
    operator_role: 'tenant', layer: 'tenant', tenant_id: 4, tenant_name: '恒峰金融服务', action: 'update',
    resource_type: 'policy_pipeline', status: 'success', client_ip: '120.55.3.71', ip_location: '杭州',
    details: { summary: '启用敏感信息外发拦截' }, created_at: '2026-06-22T10:02:33Z' },
];

function matchAdminAudit(
  l: AdminAuditLog,
  p: { layer?: string; status?: string; keyword?: string; resource_type?: string; action?: string; tenant_id?: number },
): boolean {
  if (p.layer && l.layer !== p.layer) return false;
  if (p.status && l.status !== p.status) return false;
  if (p.resource_type && l.resource_type !== p.resource_type) return false;
  if (p.action && l.action !== p.action) return false;
  if (p.tenant_id != null && l.tenant_id !== p.tenant_id) return false;
  if (p.keyword) {
    const kw = p.keyword.toLowerCase();
    const hay = [l.username, l.operator_name, l.resource_type, l.client_ip]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(kw)) return false;
  }
  return true;
}

export function mockAdminAuditList(
  params: {
    layer?: 'platform' | 'tenant';
    status?: 'success' | 'failed';
    keyword?: string;
    resource_type?: string;
    action?: string;
    tenant_id?: number;
    page?: number;
    page_size?: number;
  } = {},
) {
  const all = mockAdminAuditLogs.filter((l) => matchAdminAudit(l, params));
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 50;
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total: all.length, page, page_size: pageSize };
}

export function mockAdminAuditStats(
  params: {
    layer?: 'platform' | 'tenant';
    status?: 'success' | 'failed';
    keyword?: string;
    resource_type?: string;
    action?: string;
    tenant_id?: number;
  } = {},
) {
  const all = mockAdminAuditLogs.filter((l) => matchAdminAudit(l, params));
  const success = all.filter((l) => l.status === 'success').length;
  return { total: all.length, success, failed: all.length - success };
}
