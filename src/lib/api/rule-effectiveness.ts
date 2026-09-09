import { apiRequest, type ApiRequestFn } from './client';

// 规则效能统计（观察模式）— 数据契约
//
// 范围固定为 3 类持续性「观察态」模块（详见需求方案）：
//   - auth_spoofing：身份认证与仿冒检测下的各子策略
//   - similar_detection：相似邮件检测模块下的各方向
//   - phishing_detection：钓鱼邮件检测智能体（整引擎级，无子策略维度）
// 高级规则（单条 action=observe）与仿冒品牌/人物检测不在本期范围内。

export type PolicyModule = 'auth_spoofing' | 'similar_detection' | 'phishing_detection';

/** 与安全总览共用的邮件方向枚举，相似检测按方向拆分观察对象时复用同一枚举。 */
export type Direction = 'receive' | 'send' | 'internal';

/** 身份认证与仿冒检测下的子策略枚举。 */
export type AuthSpoofingSubStrategy =
  | 'protocol_check'
  | 'format_check'
  | 'display_name_spoofing'
  | 'similar_domain'
  | 'dkim_outbound_signature'
  | 'arc_signature';

export type TimeRange = 'today' | '7d' | '30d' | 'custom';
export type ObserveDurationBucket = 'lt7' | '7to30' | 'gt30';

/** 若不是观察模式，命中原本会被执行的处置动作。 */
export type WouldBeAction = 'reject' | 'quarantine' | 'discard' | 'bounce' | 'sideline' | 'recall' | 'tag';

/** 转正式建议引擎输出的四态标签。 */
export type PromotionSuggestion = 'confirm_promote' | 'keep_observing' | 'needs_tuning' | 'needs_more_data';

/** 规则归因状态——判断最终处置动作是否确实由被观察的规则本身主导。 */
export type AttributionStatus = 'attributable' | 'excluded_not_attributable' | 'module_level_only';

export interface RuleEffectivenessParams {
  startDate?: string;
  endDate?: string;
  modules?: PolicyModule[];
  durationBuckets?: ObserveDurationBucket[];
  tenantId?: number | null;
}

export interface RuleEffectivenessKpi {
  observing_count: number;
  observing_count_delta: number | null;
  total_hits: number;
  total_hits_delta: number | null;
  would_block_count: number;
  would_block_count_delta: number | null;
  avg_observed_days: number;
  pending_review_count: number;
}

export interface RuleEffectivenessTrendPoint {
  date: string;
  auth_spoofing: number;
  similar_detection: number;
  phishing_detection: number;
}

export interface ActionBreakdownItem {
  action: WouldBeAction;
  count: number;
}

export interface RuleEffectivenessRow {
  id: string;
  policy_module: PolicyModule;
  sub_strategy_id: string;
  sub_strategy_name_snapshot: string;
  is_deleted: boolean;
  observed_since: string;
  observed_days: number;
  hits: number;
  would_block_count: number;
  reviewed_count: number;
  weighted_reviewed_count: number;
  false_positive_rate: number | null;
  attribution_status: AttributionStatus;
  suggestion: PromotionSuggestion;
  suggestion_reason: string;
  action_breakdown: ActionBreakdownItem[];
  /** 前往策略配置页的路径。 */
  config_path: string;
}

export interface RuleEffectivenessResponse {
  kpi: RuleEffectivenessKpi;
  trend: RuleEffectivenessTrendPoint[];
  rows: RuleEffectivenessRow[];
  /** 本次请求中数据源降级（超时/不可用）的模块，其余模块数据仍可正常展示。 */
  degraded_modules: PolicyModule[];
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

export function getRuleEffectivenessExportCsvUrl(params: {
  startDate: string;
  endDate: string;
  modules?: PolicyModule[];
  durationBuckets?: ObserveDurationBucket[];
  tenantId: number | null;
}): string {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    module: params.modules,
    duration_bucket: params.durationBuckets,
    tenant_id: params.tenantId ?? undefined,
    mode: 'observe',
  });
  return `${API_BASE}/statistics/rule-effectiveness/export.csv?${query}`;
}

export async function getRuleEffectiveness(
  params: RuleEffectivenessParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<RuleEffectivenessResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    module: params.modules,
    duration_bucket: params.durationBuckets,
    tenant_id: params.tenantId ?? undefined,
    mode: 'observe',
  });
  return requestFn<RuleEffectivenessResponse>(`/statistics/rule-effectiveness?${query}`);
}

/**
 * 构造跳转到邮件处置中心的查询参数——携带模块/子策略/观察起始时间，
 * 由处置中心侧按 source=rule_effectiveness 识别来源并展示上下文提示条。
 * 本函数只负责生成参数，不修改邮件处置中心自身的筛选实现。
 */
export function buildEmailDisposalCenterQuery(row: {
  policy_module: PolicyModule;
  sub_strategy_id: string;
  observed_since: string;
}): string {
  const query = new URLSearchParams({
    source: 'rule_effectiveness',
    policy_key: row.policy_module,
    sub_strategy: row.sub_strategy_id,
    observe_window_from: row.observed_since,
  });
  return query.toString();
}
