import { apiRequest, type ApiRequestFn } from './client';

// Recipient-copy observation statistics, scoped to the current observation period.
export type PolicyModule = 'auth_spoofing' | 'similar_detection' | 'phishing_detection' | 'sender_filter';

export type Direction = 'receive' | 'send' | 'internal';

/**
 * 相似检测下的两条独立策略——相似邮件检测（按内容相似度判定）与相同主题检测
 * （按主题标准化后判定），语义、误判特征完全不同，观察对象必须按策略拆分，
 * 不能合并为一个笼统的「相似检测」模块级观察对象。
 */
export type SimilarDetectionType = 'similar_email' | 'same_subject';

/** 相似检测每条策略自身的聚合方式：全方向聚合为一个观察对象，或按方向拆分为多个。 */
export type SimilarDetectionScope = 'aggregate' | Direction;

/** Each protocol result is an independent observation object. */
export type AuthSpoofingSubStrategy = `${'spf' | 'dkim' | 'dmarc' | 'ptr'}_${string}` | `format_check_${string}` | `display_name_spoofing_${string}` | 'similar_domain';
export interface ProtocolHitBreakdownItem { protocol: 'spf' | 'dkim' | 'dmarc' | 'ptr'; subkey: string; hits: number }

export type TimeRange = 'today' | '7d' | '30d' | 'custom';
export type ObserveDurationBucket = 'lt7' | '7to30' | 'gt30';

/** Latest confirmed outcome of each recipient copy, across all modules. */
export type WouldBeAction = 'accept' | 'quarantine' | 'audit' | 'reject' | 'discard' | 'recall';

/** 观察命中的归属能力；观察规则本身不执行最终处置。 */
export type AttributionStatus = 'attributable' | 'excluded_not_attributable' | 'module_level_only';

export interface RuleEffectivenessParams {
  startDate?: string;
  endDate?: string;
  modules?: PolicyModule[];
  /** 仅在 modules 包含 'similar_detection' 时生效——进一步收窄到具体的相似检测策略。 */
  similarDetectionTypes?: SimilarDetectionType[];
  durationBuckets?: ObserveDurationBucket[];
  tenantId?: number | null;
  page?: number;
  pageSize?: number;
  overdueOnly?: boolean;
}

export interface RuleEffectivenessKpi {
  observing_count: number;
  observing_count_delta: number | null;
  total_hits: number;
  total_hits_delta: number | null;
  avg_observed_days: number;
  pending_review_count: number;
  overdue_count: number;
  unknown_start_count: number;
}

export interface ActionBreakdownItem {
  action: WouldBeAction;
  count: number;
}

export interface RuleEffectivenessRow {
  version_no: number;
  history_count: number;
  effective_at: string;
  superseded_at: string | null;
  close_reason: string;
  change_summary: string;
  snapshot_available: boolean;
  window_from?: string;
  window_to?: string;
  time_zone: string;
  id: string;
  policy_module: PolicyModule;
  /** 仅 policy_module === 'similar_detection' 时有值：该观察对象归属的具体策略。 */
  similar_detection_type?: SimilarDetectionType;
  /** 仅 policy_module === 'similar_detection' 时有值：该观察对象的聚合方式/方向。 */
  similar_detection_scope?: SimilarDetectionScope;
  sub_strategy_id: string;
  sub_strategy_name_snapshot: string;
  observed_since: string | null;
  observed_days: number | null;
  hits: number;
  tenant_id: number;
  tenant_name: string;
  observation_period_id: string;
  distinct_message_count: number;
  /** 命中时冻结的原配置动作；用于解释动作差异风险。 */
  configured_action: WouldBeAction | 'proceed' | '';
  /** 同一观察期内命中记录是否包含多个配置动作。 */
  mixed_config: boolean;
  pending_outcome_count: number;
  other_outcome_count: number;
  unknown_outcome_count: number;
  action_difference_rate: number | null;
  risk_unavailable_reason: string;
  risk_direction: string;
  attribution_status: AttributionStatus;
  action_breakdown: ActionBreakdownItem[];
  /** 仅认证协议检查（protocol_check_spf/dkim/dmarc/ptr）行有值：该协议下各判定结果的命中构成。 */
  protocol_hit_breakdown?: ProtocolHitBreakdownItem[];
  /** 前往策略配置页的路径。 */
  config_path: string;
}

export interface RuleEffectivenessResponse {
  unavailable_modules: PolicyModule[];
  quality: {
    generated_at: string;
    available_from: string | null;
    history_complete: boolean;
    complete: boolean;
    pending_changes: number;
    pending_hits: number;
    pending_outcomes: number;
    excluded_events: number;
  };
  kpi: RuleEffectivenessKpi;
  rows: RuleEffectivenessRow[];
  /** 本次请求中数据源降级（超时/不可用）的模块，其余模块数据仍可正常展示。 */
  degraded_modules: PolicyModule[];
  rows_total: number;
  page: number;
  page_size: number;
}

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => query.append(key, String(v)));
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

export async function getRuleEffectiveness(
  params: RuleEffectivenessParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<RuleEffectivenessResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    module: params.modules,
    similar_detection_type: params.similarDetectionTypes,
    duration_bucket: params.durationBuckets,
    tenant_id: params.tenantId ?? undefined,
    mode: 'observe',
    page: params.page ?? 1,
    page_size: params.pageSize ?? 20,
    overdue_only: params.overdueOnly || undefined,
  });
  return requestFn<RuleEffectivenessResponse>(`/statistics/rule-effectiveness?${query}`);
}

/** Keep the exact authorized period and date window used by the report. */
export function buildEmailDisposalCenterQuery(row: RuleEffectivenessRow, startDate: string, endDate: string): string {
  if (row.superseded_at && row.window_from && row.window_to) {
    const calendar = (value: string, end = false) => new Intl.DateTimeFormat('en-CA', {timeZone: row.time_zone || 'UTC', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(new Date(value).getTime() - (end ? 1 : 0)));
    startDate = calendar(row.window_from); endDate = calendar(row.window_to, true);
  }
  return new URLSearchParams({
    source: 'rule_effectiveness', policy_key: row.policy_module,
    strategy_name: row.sub_strategy_name_snapshot,
    sub_strategy: row.sub_strategy_id, observation_period_id: row.observation_period_id,
    tenant_id: String(row.tenant_id), observe_window_from: startDate,
    observe_window_to: endDate,
    ...(row.time_zone ? { observe_time_zone: row.time_zone } : {}),
  }).toString();
}

export interface ObservationVersionHistory { items: RuleEffectivenessRow[]; total: number; page: number; page_size: number; quality: RuleEffectivenessResponse['quality'] }
export interface ObservationVersionSnapshot {
  observation_period_id: string; version_no: number; tenant_id: number; policy_module: PolicyModule;
  sub_strategy_key: string; started_at: string; ended_at: string | null;
  config_snapshot: { schema_version: number; config: Record<string, unknown> };
  changed_fields: { field: string; before: unknown; after: unknown }[];
}
export function getObservationVersions(row: RuleEffectivenessRow, page: number, request: ApiRequestFn = apiRequest) {
  const query = buildQuery({ tenant_id: row.tenant_id, module: row.policy_module, sub_strategy_key: row.sub_strategy_id, page, page_size: 10 });
  return request<ObservationVersionHistory>(`/statistics/rule-effectiveness/versions?${query}`);
}
export function getObservationSnapshot(row: RuleEffectivenessRow, request: ApiRequestFn = apiRequest) {
  return request<ObservationVersionSnapshot>(`/statistics/rule-effectiveness/versions/${encodeURIComponent(row.id)}?tenant_id=${row.tenant_id}`);
}
