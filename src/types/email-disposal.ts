import type {
  AdvancedFilter,
  FilterCondition,
  FilterConditionGroup,
  FinalActionRuleDetail,
} from "@/types/log";

export interface DisposalQuickFilter {
  sendReceiveTime?: { start: string; end: string };
  sendReceiveType?: string;
  senderIp?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  /** @deprecated Kept only for loading older saved templates; use executionActions. */
  executionAction?: string;
  /** Display-level execution actions; submitted as one `action in [...]` condition. */
  executionActions?: ExecutionAction[];
  /** @deprecated Kept only for loading older saved templates. */
  emailStatus?: string;
  emailStatuses?: string[];
  // Multi-value (spec §3.3.1): comma-separated onto the wire as email_type=a,b.
  emailTypes?: string[];
  // Multi-value (spec §4.3): comma-separated onto the wire as
  // disposal_policy_keys=IPBL,CR (any-module-hit / OR semantics).
  disposalPolicyKeys?: string[];
  // Rule-name/ID mode in the disposal-basis quick filter. These values are
  // translated to disposal_basis.rule_id advanced conditions.
  disposalRuleIds?: string[];
  ipLocation?: string;
}

export interface DisposalSearchParams {
  quick: DisposalQuickFilter;
  advanced: AdvancedFilter;
  aiConditions?: AICondition[];
  page: number;
  pageSize: number;
}

export interface AICondition {
  field: string;
  op: string;
  // design spec §7 (2026-07-25-ai-search-dedicated-llm-config): 原为 string，
  // AI 解析结果的 in/between 等条件值现在保持结构化形态（数组/数字/布尔）直
  // 传，不再在 search-bar.tsx 拍平成逗号拼接字符串——那样会让 in/between 条
  // 件在后端 ParseAdvancedFilter 校验时因"期望数组却收到字符串"而 400。
  // is_null/is_not_null 等无值操作符下可为 undefined。
  value?: FilterCondition["value"];
  source: "ai";
}

/**
 * Unified execution-action enum — single source of truth shared by:
 *   - 邮件处置中心 › 搜索条件 › 执行动作 (quick-filters.tsx)
 *   - 邮件安全总览 › 安全态势分析 › 执行动作图表 (TrendChartCard action series)
 *
 * Keys MUST mirror the backend's display-action enum
 * (internal/models/security_overview.go `AllActions`): it feeds both the
 * search filter's `action` virtual field (validated server-side) and the
 * `trend.action` series keys.
 */
export const EXECUTION_ACTIONS = [
  'deliver',
  'quarantine',
  'review',
  'block',
  'drop',
  'recall',
] as const;

export type ExecutionAction = (typeof EXECUTION_ACTIONS)[number];

/**
 * GT-12955 批准的 13 个位置维度展示状态（纯契约类型）：取值与后端
 * models.DisplayStatusValues / api/openapi.yaml 的 display_statuses 枚举
 * 逐值一致，前端不再计算任何展示状态，只消费后端下发的列表。
 * 一致性守卫：webapp/tests/unit/disposal-enum-label-coverage.test.ts
 * （union ↔ openapi 枚举 ↔ i18n 键三方对拍）。
 * 数组顺序即后端下发和筛选顺序。
 */
export const DISPLAY_STATUSES = [
  "delivering",
  "quarantine_pending",
  "sideline_pending",
  "audit_pending",
  "rejected",
  "discarded",
  "delivery_cancelled",
  "delivered",
  "delivery_failed",
  "recall_pending",
  "recall_success",
  "recall_failed",
  "expired",
] as const;

export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

/**
 * 后端下发的展示状态列表条目（display_statuses）：一致邮件通常为单元素，
 * mixed / 部分投递 / 部分召回为多元素。count 是该状态实际覆盖的对象数；召回态
 * 只统计实际创建召回请求的收件人，不能用整封收件人数代替。
 * **显示与筛选同源**：按状态筛选 = 列表包含该状态；mixed 的包含语义
 * （一封信里有的状态就能筛到）是后端刻意设计，不是前后端漂移。
 */
export interface DisplayStatusEntry {
  status: DisplayStatus;
  count: number;
}

export interface DisposalBasis {
  policy_key?: string;
  rule_name?: string;
  rule_id?: string;
  action?: string;
  hit_values?: Record<string, string>;
  detection_tags?: string[];
  /** 本条规则命中的收件人（仅出现在 modules 条目上）。 */
  recipients?: string[];
  /** @deprecated 旧 per_recipient[] 的单收件人字段，仅用于历史展示回落。 */
  recipient?: string;
  /**
   * recipients 的子集：本条规则最终决定了动作的收件人。
   * undefined 与 [] 语义不同（GT-12727 spec §7.10.3）：
   *   undefined = 无归属信息（连接/MAIL 阶段，或老数据回落）→ 不打任何徽标
   *   []        = 确知未生效
   */
  effective_for?: string[];
  /** 本封邮件命中的模块清单（不是穷尽列表，见 GT-12727 spec §7.5）。 */
  modules?: DisposalBasis[];
  /** @deprecated 已停写（GT-12727 spec §7.9），仅老数据仍有。 */
  per_recipient?: DisposalBasis[];
}

export interface DisposalBasisEntrySummary {
  rule_name?: string;
  rule_id?: string;
  action?: string;
  hit_values?: Record<string, string>;
  detection_tags?: string[];
  recipient_count: number;
  effective_count: number;
  effective_known: boolean;
}

/** 列表专用轻量分组；不包含任何收件人地址数组。 */
export interface DisposalBasisGroupSummary {
  policy_key: string;
  entries: DisposalBasisEntrySummary[];
  recipient_count: number;
  effective_count: number;
  effective_known: boolean;
}

export interface DisposalMailItem {
  id: number;
  timestamp: string;
  direction: string;
  sender: string;
  recipient: string;
  recipientList?: string[];
  subject: string;
  action: string;
  status: string;
  /**
   * 后端下发的展示状态列表（display_statuses，GT-12782 Task 4）。前端不再
   * 自己算状态：单元素 → 单徽章；多元素（mixed）→ 分段展示。
   */
  displayStatuses: DisplayStatusEntry[];
  /** Raw recall fold retained for detail/audit; badges always use displayStatuses. */
  recallStatusSummary?: string;
  similarity?: number;
  threatLevel?: string;
  intentLabel?: string;
  clientIp?: string;
  emailSize?: number;
  attachmentCount?: number;
  queueId?: string;
  storageNode?: string;
  emailType?: string;
  emailTypeOverridden?: boolean;
  emailTypeOriginal?: string;
  correctionSource?: string;
  disposalBasis?: DisposalBasis;
  disposalBasisGroups?: DisposalBasisGroupSummary[];
  /** mail_log.reason 自由文本。disposalBasis 缺失时按落地 spec §4.1 回退显示（GT-12578/GT-12686）。 */
  reason?: string;
  disposalPolicyKeys?: string;
  /** Per-recipient action details; present when action === 'mixed'. */
  finalActionRule?: Record<string, FinalActionRuleDetail>;
  /** Per-recipient final dispositions; drives the mixed-status stacked bar (方案 C). */
  recipientDispositions?: import('@/types/phishing-detection').RecipientDisposition[];
  /** Distinct actions across all recipients (e.g. ['accept','quarantine']). */
  dispositionActions?: string[];
}

export interface DisposalListResponse {
  items: DisposalMailItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface BulkDisposeRequest {
  mail_log_ids: number[];
  action: "release" | "delete" | "recall";
  final_type?: string;
}

export interface BulkDisposeFailureItem {
  id: number;
  reason: string;
}

export interface RecipientOperationResult {
  mail_log_id: number;
  object_kind?: string;
  object_id?: string;
  recipients: string[];
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
}

export interface BulkDisposeResponse {
  succeeded: number[];
  failed: BulkDisposeFailureItem[];
  not_applicable: number[];
  /** Mixed messages where only part of the actionable recipient objects succeeded. */
  partial?: number[];
  /** Additive per-recipient/object outcomes; populated for mixed-message disposal. */
  recipient_results?: RecipientOperationResult[];
  // Ids whose dispose succeeded but the bundled final_type reclassify failed
  // afterward (spec §6.1 "已处置，但改判失败"); dispose is not rolled back.
  reclassify_failed?: number[];
}

export interface RecallMailsResponse {
  succeeded: number[];
  failed: BulkDisposeFailureItem[];
  /** Messages where at least one recallable recipient succeeded and another recipient failed or was unsupported. */
  partial?: number[];
  reclassify_failed?: number[];
  recipient_results?: RecipientOperationResult[];
}

export interface SimilarSearchRequest {
  mail_log_ids: number[];
  limit?: number;
}

export interface ParseQueryRequest {
  description: string;
}

export interface ParseQueryResponse {
  filter: AdvancedFilter | null;
  summary: string;
  source: string;
}

export { type AdvancedFilter, type FilterCondition, type FilterConditionGroup };
