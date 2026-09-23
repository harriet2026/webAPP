import { apiRequest, type ApiRequestFn } from './client';
import { getRuleEffectiveness as getReportPage, getObservationVersions, getObservationSnapshot, buildEmailDisposalCenterQuery as buildScopedMailQuery, type RuleEffectivenessRow as BackendRow } from './rule-effectiveness';

// 规则效能统计（观察模式）— 数据契约
//
// 范围固定为 4 类持续性「观察态」模块（详见需求方案）：
//   - auth_spoofing：身份认证与仿冒检测下的各子策略
//   - similar_detection：相似邮件检测模块下的各方向
//   - phishing_detection：钓鱼邮件检测智能体（整引擎级，无子策略维度）
//   - sender_filter：发信人黑白名单，按单条规则（黑名单/白名单）拆分观察对象
// 高级规则（单条 action=observe）与仿冒品牌/人物检测不在本期范围内。

export type PolicyModule = 'auth_spoofing' | 'similar_detection' | 'phishing_detection' | 'sender_filter';

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

export interface PolicyVersionFieldChange {
  field: string;
  before: unknown;
  after: unknown;
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
  /** Frozen backend identity retained for authorized mail/config navigation. */
  backend?: BackendRow;
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
  reviewed_count?: number;
  weighted_reviewed_count?: number;
  false_positive_rate: number | null;
  false_negative_rate: number | null;
  risk_direction: 'configured_block' | 'configured_accept' | '';
  risk_unavailable_reason: string;
  configured_action: string;
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
  /** 当前版本相对上一版本的冻结配置差异；仅在存在历史版本时加载。 */
  current_version_changes?: PolicyVersionFieldChange[];
  /** mock 或差异不可展开时使用的当前版本变更摘要。 */
  current_version_change_summary?: string;
  /** 前往策略配置页的路径。 */
  config_path: string;
}

export interface RuleEffectivenessResponse {
  kpi: RuleEffectivenessKpi;
  rows: RuleEffectivenessRow[];
  /** 本次请求中数据源降级（超时/不可用）的模块，其余模块数据仍可正常展示。 */
  degraded_modules: PolicyModule[];
}


/** Presentation keys differ from persisted object identities; never use these for API scope. */
function presentationStrategy(row: BackendRow): string {
  if (row.policy_module !== 'auth_spoofing') return row.sub_strategy_id;
  const key = row.sub_strategy_id;
  if (key.startsWith('format_check.')) return key.replace('.', '_');
  if (key.startsWith('display_name_spoof.')) return key.replace('display_name_spoof.', 'display_name_spoofing_');
  if (key === 'similar_domain.main') return 'similar_domain';
  return key;
}

/** Adapt the paginated backend to the product's complete, unpaginated view. */
export async function getRuleEffectiveness(
  params: RuleEffectivenessParams,
  request: ApiRequestFn = apiRequest,
  translateSummary: (key: string) => string = key => key,
): Promise<RuleEffectivenessResponse> {
  const { isMockEnabled } = await import('../mock/storage');
  if (isMockEnabled()) {
    const { mockRuleEffectivenessFor } = await import('../mock/rule-effectiveness-prototype');
    return mockRuleEffectivenessFor(params.startDate ?? '', params.endDate ?? '', params.modules ?? [], params.durationBuckets ?? [], params.similarDetectionTypes ?? []);
  }
  params = { ...params, modules: params.modules ?? ['auth_spoofing', 'similar_detection', 'phishing_detection', 'sender_filter'] };
  const first = await getReportPage({ ...params, page: 1, pageSize: 100 }, request);
  const backendRows = [...first.rows];
  for (let page = 2; backendRows.length < first.rows_total; page++) {
    const next = await getReportPage({ ...params, page, pageSize: 100 }, request);
    if (next.rows.length === 0) throw new Error('Observation report changed during pagination; retry');
    backendRows.push(...next.rows);
  }
  const rows: RuleEffectivenessRow[] = [];
  // Bound simultaneous row-history requests while retaining every product row.
  for (let offset = 0; offset < backendRows.length; offset += 4) {
    rows.push(...await Promise.all(backendRows.slice(offset, offset + 4).map(async row => {
      const history: PolicyVersionEntry[] = [];
      for (let page = 1; row.history_count > history.length; page++) {
        const batch = await getObservationVersions(row, page, request);
        history.push(...batch.items.map(version => ({
          version_no: version.version_no,
          effective_at: version.effective_at,
          superseded_at: version.superseded_at,
          change_type: 'substantive' as const,
          change_summary: translateSummary(version.change_summary),
          hits: version.hits,
        })));
        if (history.length >= batch.total) break;
        if (batch.items.length === 0) throw new Error('Observation history changed during pagination; retry');
      }
      let currentVersionChanges: PolicyVersionFieldChange[] = [];
      if (row.history_count > 0 && row.snapshot_available) {
        try {
          const snapshot = await getObservationSnapshot(row, request);
          currentVersionChanges = snapshot.changed_fields;
        } catch {
          // Keep the report usable for viewers without snapshot permission or while
          // the snapshot endpoint is degraded; the persisted change summary remains.
        }
      }
      if (row.observed_days == null || row.observed_since == null) throw new Error('Observation start unavailable');
      return {
        ...row,
        backend: row,
        sub_strategy_id: presentationStrategy(row),
        policy_module: row.policy_module as PolicyModule,
        observed_since: row.observed_since,
        observed_days: row.observed_days,
        is_deleted: row.close_reason === 'deleted',
        // The wire metric is one action-difference rate plus its direction. The product
        // presents it in separate false-positive/false-negative risk columns.
        false_positive_rate: row.risk_direction === 'configured_block' ? row.action_difference_rate : null,
        false_negative_rate: row.risk_direction === 'configured_accept' ? row.action_difference_rate : null,
        risk_direction: row.risk_direction as RuleEffectivenessRow['risk_direction'],
        risk_unavailable_reason: row.risk_unavailable_reason,
        configured_action: row.configured_action,
        version_history: history.sort((a, b) => a.version_no - b.version_no),
        current_version_changes: currentVersionChanges,
        current_version_change_summary: translateSummary(row.change_summary),
      };
    })));
  }
  return { kpi: first.kpi, rows, degraded_modules: first.degraded_modules };
}

export function buildEmailDisposalCenterQuery(row: RuleEffectivenessRow, startDate: string, endDate: string): string {
  if (row.backend) return buildScopedMailQuery(row.backend, startDate, endDate);
  // Product mock navigation keeps the original prototype contract.
  return new URLSearchParams({ source: 'rule_effectiveness', policy_key: row.policy_module,
    sub_strategy: row.similar_detection_type ? `${row.similar_detection_type}:${row.similar_detection_scope ?? row.sub_strategy_id}` : row.sub_strategy_id,
    observe_window_from: row.observed_since,
  }).toString();
}
