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

/**
 * 相似检测下的两条独立策略——相似邮件检测（按内容相似度判定）与相同主题检测
 * （按主题标准化后判定），语义、误判特征完全不同，观察对象必须按策略拆分，
 * 不能合并为一个笼统的「相似检测」模块级观察对象。
 */
export type SimilarDetectionType = 'similar_email' | 'same_subject';

/** 相似检测每条策略自身的聚合方式：全方向聚合为一个观察对象，或按方向拆分为多个。 */
export type SimilarDetectionScope = 'aggregate' | Direction;

/**
 * 身份认证与仿冒检测下的子策略枚举——按配置页真实的观察开关颗粒度拆分：
 *   - protocol_check_spf / _dkim / _dmarc / _ptr：认证协议检查下四个协议
 *     各自拥有独立的 observe_mode 开关（spf_observe_mode/dkim_observe_mode/
 *     dmarc_observe_mode/ptr_observe_mode），不再共用一个全局开关，必须拆成
 *     4 个独立观察对象；协议内部各判定结果（如 SPF fail/softfail）仍共用同一个
 *     协议级开关，作为该行的「命中构成」下钻信息展示，不再单独拆分；
 *   - format_check_*：三项各自独立 observe_mode，拆成 3 个独立对象；
 *   - display_name_spoofing_*：按方向（收/发/内部）各自独立 observe_mode，拆成 3 个对象；
 *   - similar_domain：单一开关，1 个对象。
 * DKIM 外发签名、ARC 签名管理的是密钥/域名生命周期，没有 action/observe_mode，
 * 不是可观察的检测规则，不纳入本枚举与观察模式统计范围。
 */
export type AuthSpoofingSubStrategy =
  | 'protocol_check_spf'
  | 'protocol_check_dkim'
  | 'protocol_check_dmarc'
  | 'protocol_check_ptr'
  | 'format_check_mailfrom_empty'
  | 'format_check_mailfrom_invalid'
  | 'format_check_envelope_header_mismatch'
  | 'display_name_spoofing_inbound'
  | 'display_name_spoofing_outbound'
  | 'display_name_spoofing_internal'
  | 'similar_domain';

/** 认证协议检查下四个协议各自的判定结果构成——用于命中数下钻展示，不参与观察对象拆分。 */
export interface ProtocolHitBreakdownItem {
  protocol: 'spf' | 'dkim' | 'dmarc' | 'ptr';
  subkey: string;
  hits: number;
}

export type TimeRange = 'today' | '7d' | '30d' | 'custom';
export type ObserveDurationBucket = 'lt7' | '7to30' | 'gt30';

/**
 * 命中构成——展示该观察对象命中的邮件最终的实际结果分布，口径与系统实际
 * 支持的执行动作保持一致（投递/隔离/审核/拒收/丢弃/召回），不再是「若规则
 * 不处于观察模式会执行的假设动作」：
 *   - accept（投递）：观察模式下命中本身不拦截，且未被同一封邮件命中的其他
 *     生效规则拦截，最终正常送达——观察模式下的命中默认占比最大；
 *   - quarantine（隔离）/ audit（审核）/ reject（拒收）/ discard（丢弃）：
 *     命中后被同一封邮件命中的其他生效规则拦截产生的处置结果。reject 仅
 *     身份认证与仿冒检测支持（AuthSpoofingAction 含 reject，相似检测、
 *     钓鱼检测智能体的动作枚举里都没有 reject）；quarantine/audit/discard
 *     三个模块共有；
 *   - recall（召回）：命中后先被投递，随后管理员在邮件处置中心发起人工召回，
 *     不属于三个模块规则自身的处置能力，正式接口需邮件处置中心侧提供关联字段。
 * sideline（边列）/ tag（打标）不是「规则命中的最终结果」，分别属于邮件
 * 处置中心的中间态、邮件标记模块的能力，不出现在本统计的命中构成里。
 */
export type WouldBeAction = 'accept' | 'quarantine' | 'audit' | 'reject' | 'discard' | 'recall';

/** 规则归因状态——判断最终处置动作是否确实由被观察的规则本身主导。 */
export type AttributionStatus = 'attributable' | 'excluded_not_attributable' | 'module_level_only';

/**
 * 策略版本变更类型——区分是否影响判断逻辑：
 *   - substantive（实质性变更）：匹配条件/范围/执行动作/模块类型等影响命中结果或
 *     处置结果的字段被修改，触发观察期重置（observed_since 重新计算，命中数/
 *     命中构成/误判漏判风险只统计新版本产生的数据，历史版本数据保留在
 *     version_history 中供审计追溯，不参与当前 KPI 计算）；
 *   - non_substantive（非实质性变更）：仅名称、备注等不影响判断逻辑的字段被
 *     修改，不触发观察期重置，version_no 不变。
 */
export type PolicyVersionChangeType = 'substantive' | 'non_substantive';

/** 已归档的历史版本条目——只读，仅供审计追溯，不参与当前行的 KPI 计算。 */
export interface PolicyVersionEntry {
  version_no: number;
  /** 该版本开始生效的时间。 */
  effective_at: string;
  /** 该版本被下一次修改替换（结束生效）的时间；当前版本为 null。 */
  superseded_at: string | null;
  change_type: PolicyVersionChangeType;
  /** 变更摘要，用于版本历史列表展示，如「执行动作：隔离 → 审核」。 */
  change_summary: string;
  /** 该版本生效期间累计的命中数，与当前行的 hits 字段口径一致但范围限定在该版本内。 */
  hits: number;
}

export interface RuleEffectivenessParams {
  startDate?: string;
  endDate?: string;
  modules?: PolicyModule[];
  /** 仅在 modules 包含 'similar_detection' 时生效——进一步收窄到具体的相似检测策略。 */
  similarDetectionTypes?: SimilarDetectionType[];
  durationBuckets?: ObserveDurationBucket[];
  tenantId?: number | null;
  versionId?: string;
  includeHistory?: boolean;
}

export interface RuleEffectivenessKpi {
  observing_count: number;
  observing_count_delta: number | null;
  total_hits: number;
  total_hits_delta: number | null;
  avg_observed_days: number;
  pending_review_count: number;
}

export interface ActionBreakdownItem {
  action: WouldBeAction;
  count: number;
}

export interface RuleEffectivenessRow {
  id: string;
  policy_module: PolicyModule;
  /** 仅 policy_module === 'similar_detection' 时有值：该观察对象归属的具体策略。 */
  similar_detection_type?: SimilarDetectionType;
  /** 仅 policy_module === 'similar_detection' 时有值：该观察对象的聚合方式/方向。 */
  similar_detection_scope?: SimilarDetectionScope;
  sub_strategy_id: string;
  sub_strategy_name_snapshot: string;
  is_deleted: boolean;
  /**
   * 当前生效的策略版本号，从 1 开始。规则被实质性修改（影响判断逻辑的字段变更）
   * 后版本号 +1，observed_since 重新计算，历史版本移入 version_history。
   */
  version_no: number;
  /** 观察起始时间——即当前版本（version_no）开始生效的时间，规则被实质性修改后会重新计算，不是策略最初创建的时间。 */
  observed_since: string;
  /** 观察时长——按当前版本的 observed_since 计算，不叠加历史版本的观察天数。 */
  observed_days: number;
  hits: number;
  reviewed_count: number;
  weighted_reviewed_count: number;
  false_positive_rate: number | null;
  attribution_status: AttributionStatus;
  action_breakdown: ActionBreakdownItem[];
  /** 仅认证协议检查（protocol_check_spf/dkim/dmarc/ptr）行有值：该协议下各判定结果的命中构成。 */
  protocol_hit_breakdown?: ProtocolHitBreakdownItem[];
  /**
   * 历史版本清单，按 version_no 升序排列，仅包含已被替换的版本（不包含当前版本，
   * 当前版本信息见 version_no/observed_since/observed_days/hits 等顶层字段）。
   * 为空表示该策略自纳入观察以来未发生过实质性变更。
   */
  version_history: PolicyVersionEntry[];
  /** 前往策略配置页的路径。 */
  config_path: string;
}

export interface RuleEffectivenessResponse {
  kpi: RuleEffectivenessKpi;
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
    version_id: params.versionId,
    include_history: params.includeHistory ? 'true' : undefined,
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
  similar_detection_type?: SimilarDetectionType;
  similar_detection_scope?: SimilarDetectionScope;
}): string {
  // 相似检测命中日志已按策略（similar_email/same_subject）区分来源，跳转参数用
  // `策略:范围` 复合键精确过滤，而不是笼统的模块级 sub_strategy_id，
  // 否则处置中心只能按整个「相似检测」模块过滤，定位不到具体是哪条策略触发的命中。
  const subStrategy = row.similar_detection_type
    ? `${row.similar_detection_type}:${row.similar_detection_scope ?? row.sub_strategy_id}`
    : row.sub_strategy_id;
  const query = new URLSearchParams({
    source: 'rule_effectiveness',
    policy_key: row.policy_module,
    sub_strategy: subStrategy,
    observe_window_from: row.observed_since,
  });
  return query.toString();
}
