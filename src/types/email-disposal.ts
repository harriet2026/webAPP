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
  executionAction?: string;
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
  'mark_deliver',
  'quarantine',
  'review',
  'block',
  'drop',
  'recall',
] as const;

export type ExecutionAction = (typeof EXECUTION_ACTIONS)[number];

export type DisplayStatus =
  | "rejected"
  | "bounced"
  | "discarded"
  | "quarantine_pending"
  | "sideline_pending"
  | "audit_pending"
  | "delivering"
  | "delivered"
  | "partial_delivered"
  | "delivery_failed"
  | "recall_pending"
  | "recall_success"
  | "recall_failed"
  | "partial_recall_success"
  | "deleted"
  | "expired"
  | "reviewed_rejected";

export interface DisposalBasis {
  policy_key?: string;
  rule_name?: string;
  rule_id?: string;
  action?: string;
  hit_values?: Record<string, string>;
  detection_tags?: string[];
  per_recipient?: DisposalBasis[];
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
  displayStatus: DisplayStatus;
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
  disposalPolicyKeys?: string;
  /** Per-recipient action details; present when action === 'mixed'. */
  finalActionRule?: Record<string, FinalActionRuleDetail>;
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

export interface BulkDisposeResponse {
  succeeded: number[];
  failed: BulkDisposeFailureItem[];
  not_applicable: number[];
  // Ids whose dispose succeeded but the bundled final_type reclassify failed
  // afterward (spec §6.1 "已处置，但改判失败"); dispose is not rolled back.
  reclassify_failed?: number[];
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
